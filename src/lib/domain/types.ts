// Typed data contracts shared by the demo adapter, the Supabase adapter and the UI.
// Column names mirror supabase/migrations (snake_case in DB, camelCase here).

export type Role = "owner" | "manager" | "groomer" | "receptionist";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "in_service"
  | "ready_pickup"
  | "completed"
  | "cancelled"
  | "no_show";

export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "partially_refunded" | "refunded";
export type ContractStatus = "not_required" | "pending" | "signed" | "superseded";
export type NotificationStatus = "queued" | "sent" | "failed" | "not_applicable";
export type PaymentMethod = "cash" | "transfer" | "external_card";
export type PaymentType = "payment" | "refund";
export type Species = "dog" | "cat" | "other";
export type Sex = "male" | "female" | "unknown";
export type NoteSource = "owner_reported" | "groomer_observed";
export type NoteCategory = "skin" | "behavior" | "health" | "product" | "grooming";
export type MediaCategory = "avatar" | "before" | "after" | "care" | "incident";
export type ItemApproval = "approved" | "pending_owner" | "declined";

export interface Shop {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  phone: string;
  address: string;
  bookingNotice: string;
}

export interface Staff {
  id: string;
  shopId: string;
  displayName: string;
  role: Role;
  isGroomer: boolean;
  /** service ids this groomer is qualified for */
  serviceIds: string[];
  color: "teal" | "ochre" | "slate";
}

export interface Customer {
  id: string;
  shopId: string;
  name: string;
  phone: string;
  lineLinked: boolean;
}

export interface Pet {
  id: string;
  shopId: string;
  primaryCustomerId: string;
  name: string;
  species: Species;
  breed: string | null;
  sex: Sex;
  birthdate: string | null; // YYYY-MM-DD
  birthdateEstimated: boolean;
  neutered: boolean | null;
  coatColor: string | null;
  microchipMasked: string | null;
  photoUrl: string | null;
  groomingPreferences: string | null;
  productPreferences: string | null;
  estimatedMinutes: number | null;
}

export interface WeightRecord {
  id: string;
  petId: string;
  weightKg: number;
  measuredAt: string; // ISO
  recordedBy: string | null;
}

export interface PetNote {
  id: string;
  petId: string;
  category: NoteCategory;
  source: NoteSource;
  body: string;
  severity: "high" | "normal";
  updatedBy: string;
  updatedAt: string; // ISO
}

export interface PetMedia {
  id: string;
  petId: string;
  appointmentId: string | null;
  category: MediaCategory;
  url: string;
  takenAt: string;
  caption: string | null;
}

export interface Service {
  id: string;
  shopId: string;
  name: string;
  description: string;
  basePrice: number; // NTD integer
  priceIsFrom: boolean;
  durationMinutes: number;
  bufferMinutes: number;
  isAddon: boolean;
  species: Species[];
  onlineBookable: boolean;
}

export interface AppointmentItem {
  id: string;
  appointmentId: string;
  serviceId: string;
  name: string;
  priceSnapshot: number;
  durationSnapshot: number;
  approval: ItemApproval;
}

export interface AppointmentEvent {
  id: string;
  appointmentId: string;
  kind:
    | "created"
    | "requested"
    | "confirmed"
    | "rescheduled"
    | "status_changed"
    | "finish_recorded"
    | "incident"
    | "payment"
    | "refund"
    | "handover"
    | "handover_unpaid_authorized"
    | "notification"
    | "cancelled"
    | "addon_requested"
    | "addon_decided"
    | "warning";
  actorName: string;
  at: string;
  summary: string;
}

export interface PaymentTransaction {
  id: string;
  appointmentId: string;
  type: PaymentType;
  method: PaymentMethod;
  amount: number;
  idempotencyKey: string;
  note: string | null;
  createdAt: string;
  createdBy: string;
}

export interface NotificationJob {
  id: string;
  appointmentId: string;
  kind: "ready_pickup" | "booking_received" | "booking_confirmed";
  channel: "line_mock";
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export interface FinishRecord {
  finishedAt: string;
  outcome: "normal" | "abnormal";
  note: string | null;
  incidentNote: string | null;
  ownerContact: "contacted" | "not_contacted" | "unreachable" | null;
}

export interface Appointment {
  id: string;
  shopId: string;
  petId: string;
  customerId: string;
  staffId: string | null;
  startsAt: string;
  endsAt: string; // service end (without buffer)
  bufferMinutes: number;
  status: AppointmentStatus;
  version: number;
  source: "staff" | "online";
  contractStatus: ContractStatus;
  pickupExpectedAt: string | null;
  customerNote: string | null;
  finish: FinishRecord | null;
  checkedInAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
}

export interface TimeOff {
  id: string;
  staffId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}

export interface OperatingHours {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  opens: string | null; // HH:mm, null = closed
  closes: string | null;
}

export interface StaffBreak {
  staffId: string;
  starts: string; // HH:mm daily
  ends: string;
  label: string;
}

/** Appointment joined with the pieces every list needs, so screens never re-join by hand. */
export interface AppointmentView extends Appointment {
  pet: Pet;
  customer: Customer;
  staff: Staff | null;
  items: AppointmentItem[];
  payments: PaymentTransaction[];
  notifications: NotificationJob[];
  totalDue: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  highNotes: PetNote[];
}

export interface PetView extends Pet {
  customer: Customer;
  latestWeight: WeightRecord | null;
  notes: PetNote[];
}

export interface Session {
  staffId: string;
  displayName: string;
  role: Role;
  shopId: string;
}
