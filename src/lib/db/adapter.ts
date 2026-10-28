import type {
  Appointment,
  AppointmentEvent,
  AppointmentView,
  Customer,
  FinishRecord,
  PaymentMethod,
  PaymentType,
  PetMedia,
  PetNote,
  PetView,
  Service,
  Session,
  Shop,
  Staff,
  WeightRecord,
} from "@/lib/domain/types";
import type { ScheduleContext, Slot } from "@/lib/domain/availability";

export type DomainErrorCode =
  | "CONFLICT"
  | "VERSION_MISMATCH"
  | "INVALID_TRANSITION"
  | "FORBIDDEN"
  | "OFFLINE"
  | "SLOT_TAKEN"
  | "OTP_INVALID"
  | "NOT_FOUND"
  | "VALIDATION";

export class DomainError extends Error {
  constructor(
    public code: DomainErrorCode,
    message: string,
    public details?: string[],
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export interface AppointmentDetail extends AppointmentView {
  events: AppointmentEvent[];
  media: PetMedia[];
}

export interface PetDetail extends PetView {
  weights: WeightRecord[];
  media: PetMedia[];
  appointments: AppointmentView[];
  siblings: { id: string; name: string; photoUrl: string | null }[];
}

export interface CreateAppointmentInput {
  petId: string;
  staffId: string;
  startsAt: string;
  serviceIds: string[];
  clientRequestId: string;
}

export interface PaymentInput {
  type: PaymentType;
  method: PaymentMethod;
  amount: number;
  idempotencyKey: string;
  note?: string;
}

export interface BookingRequestInput {
  shopSlug: string;
  serviceId: string;
  startsAt: string;
  staffId: string | null;
  clientRequestId: string;
  note?: string;
  /** returning customer: verified token + chosen pet */
  verifiedToken?: string;
  petId?: string;
  /** new customer */
  newCustomer?: { name: string; phone: string; petName: string; species: "dog" | "cat"; breed?: string; weightKg?: number | null };
}

export interface PublicBookingInfo {
  shop: Shop;
  services: Service[];
  groomers: { id: string; displayName: string }[];
  /** 0 = Sunday … 6 = Saturday */
  closedWeekdays: number[];
}

/**
 * One interface, two implementations: demo (fixtures, M0) and supabase (M1+).
 * Every mutation is validated again by the backend; the UI never assumes success.
 */
export interface DataAdapter {
  mode: "demo" | "supabase";
  now(): string;
  getSession(): Promise<Session>;
  getShop(): Promise<Shop>;
  listStaff(): Promise<Staff[]>;
  listServices(): Promise<Service[]>;
  getScheduleContext(): Promise<ScheduleContext>;

  listAppointments(range: { from: string; to: string }): Promise<AppointmentView[]>;
  listPendingRequests(): Promise<AppointmentView[]>;
  getAppointment(id: string): Promise<AppointmentDetail>;

  searchPets(query: string): Promise<PetView[]>;
  getPet(id: string): Promise<PetDetail>;
  getCustomer(id: string): Promise<Customer>;
  addWeight(petId: string, weightKg: number): Promise<void>;
  addNote(petId: string, note: { category: PetNote["category"]; source: PetNote["source"]; body: string; severity: PetNote["severity"] }): Promise<void>;

  createAppointment(input: CreateAppointmentInput): Promise<Appointment>;
  confirmAppointment(id: string, version: number, staffId?: string): Promise<Appointment>;
  cancelAppointment(id: string, version: number, reason: string): Promise<Appointment>;
  rescheduleAppointment(id: string, version: number, startsAt: string, staffId: string): Promise<Appointment>;
  checkIn(id: string, version: number): Promise<Appointment>;
  startService(id: string, version: number): Promise<Appointment>;
  markNoShow(id: string, version: number): Promise<Appointment>;
  finishService(id: string, version: number, record: FinishRecord): Promise<Appointment>;
  requestAddon(id: string, serviceId: string): Promise<void>;
  decideAddon(appointmentId: string, itemId: string, approve: boolean): Promise<void>;
  recordPayment(id: string, input: PaymentInput): Promise<void>;
  handover(id: string, version: number, unpaidReason?: string): Promise<Appointment>;
  retryNotification(jobId: string): Promise<void>;

  getPublicBooking(slug: string): Promise<PublicBookingInfo>;
  getPublicSlots(slug: string, date: string, serviceId: string, staffId: string | null): Promise<Slot[]>;
  requestOtp(slug: string, phone: string): Promise<{ sent: boolean; demoCode?: string }>;
  verifyOtp(slug: string, phone: string, code: string): Promise<{ token: string; customerName: string; pets: { id: string; name: string; breed: string | null; photoUrl: string | null }[] }>;
  submitBookingRequest(input: BookingRequestInput): Promise<{ appointmentId: string; status: "pending"; duplicate: boolean }>;
}
