// Fixed, fictional demo data (docs/SCREEN_BLUEPRINTS.md「通用測試資料」).
// Demo "today" is 2026-10-28 (Wed) 15:10 Asia/Taipei — NOT the real current time.
import { taipeiIso } from "@/lib/domain/time";
import { DEMO_PHOTOS } from "@/assets/pets";
import type {
  Appointment,
  AppointmentEvent,
  AppointmentItem,
  Customer,
  NotificationJob,
  OperatingHours,
  PaymentTransaction,
  Pet,
  PetMedia,
  PetNote,
  Service,
  Shop,
  Staff,
  StaffBreak,
  TimeOff,
  WeightRecord,
} from "@/lib/domain/types";

export const DEMO_TODAY = "2026-10-28";
export const DEMO_NOW = taipeiIso(DEMO_TODAY, "15:10");
const at = (d: string, t: string) => taipeiIso(d, t);
const T = DEMO_TODAY;
const photo = (f: string) => DEMO_PHOTOS[f];

export interface DemoDb {
  shop: Shop;
  staff: Staff[];
  services: Service[];
  customers: Customer[];
  pets: Pet[];
  weights: WeightRecord[];
  notes: PetNote[];
  media: PetMedia[];
  appointments: Appointment[];
  items: AppointmentItem[];
  events: AppointmentEvent[];
  payments: PaymentTransaction[];
  notifications: NotificationJob[];
  hours: OperatingHours[];
  breaks: StaffBreak[];
  timeOff: TimeOff[];
  clientRequestIds: Record<string, string>;
  seq: number;
  clockOffsetMin: number;
}

const SHOP = "shop-calm";

export function createFixtures(): DemoDb {
  const shop: Shop = {
    id: SHOP,
    slug: "calm-studio",
    name: "靜室寵物美容",
    timezone: "Asia/Taipei",
    phone: "02-2700-0000",
    address: "台北市大安區（虛構地址）",
    bookingNotice: "線上送出為「預約申請」，店家確認後才算預約成功。若需取消請於前一天告知。",
  };

  const services: Service[] = [
    { id: "svc-bath", shopId: SHOP, name: "基礎洗澡", description: "洗澡、吹整、清耳、擠肛門腺", basePrice: 700, priceIsFrom: true, durationMinutes: 60, bufferMinutes: 15, isAddon: false, species: ["dog"], onlineBookable: true },
    { id: "svc-bath-trim", shopId: SHOP, name: "洗澡＋修剪", description: "基礎洗澡加臉、腳、腹部修剪", basePrice: 900, priceIsFrom: true, durationMinutes: 120, bufferMinutes: 15, isAddon: false, species: ["dog"], onlineBookable: true },
    { id: "svc-bath-brush", shopId: SHOP, name: "洗澡＋梳毛", description: "基礎洗澡加全身除廢毛", basePrice: 650, priceIsFrom: true, durationMinutes: 75, bufferMinutes: 15, isAddon: false, species: ["dog"], onlineBookable: true },
    { id: "svc-style", shopId: SHOP, name: "精緻造型", description: "全身造型修剪，依毛量與配合度估價", basePrice: 1500, priceIsFrom: true, durationMinutes: 150, bufferMinutes: 15, isAddon: false, species: ["dog"], onlineBookable: true },
    { id: "svc-cat-bath", shopId: SHOP, name: "貓咪洗澡", description: "安靜時段、單獨空間", basePrice: 1100, priceIsFrom: true, durationMinutes: 90, bufferMinutes: 30, isAddon: false, species: ["cat"], onlineBookable: true },
    { id: "add-nail", shopId: SHOP, name: "指甲修剪", description: "", basePrice: 100, priceIsFrom: false, durationMinutes: 10, bufferMinutes: 0, isAddon: true, species: ["dog", "cat"], onlineBookable: false },
    { id: "add-teeth", shopId: SHOP, name: "刷牙", description: "", basePrice: 150, priceIsFrom: false, durationMinutes: 10, bufferMinutes: 0, isAddon: true, species: ["dog", "cat"], onlineBookable: false },
    { id: "add-spa", shopId: SHOP, name: "燕麥舒緩 SPA", description: "", basePrice: 300, priceIsFrom: false, durationMinutes: 20, bufferMinutes: 0, isAddon: true, species: ["dog"], onlineBookable: false },
  ];
  const dogAll = ["svc-bath", "svc-bath-trim", "svc-bath-brush", "svc-style", "add-nail", "add-teeth", "add-spa"];

  const staff: Staff[] = [
    { id: "stf-wang", shopId: SHOP, displayName: "王怡君", role: "owner", isGroomer: false, serviceIds: [], color: "slate" },
    { id: "stf-amy", shopId: SHOP, displayName: "Amy", role: "groomer", isGroomer: true, serviceIds: [...dogAll, "svc-cat-bath"], color: "teal" },
    { id: "stf-may", shopId: SHOP, displayName: "May", role: "groomer", isGroomer: true, serviceIds: ["svc-bath", "svc-bath-trim", "svc-bath-brush", "svc-cat-bath", "add-nail", "add-teeth", "add-spa"], color: "ochre" },
    { id: "stf-iris", shopId: SHOP, displayName: "Iris", role: "receptionist", isGroomer: false, serviceIds: [], color: "slate" },
  ];

  const customers: Customer[] = [
    { id: "cus-lin", shopId: SHOP, name: "林小姐", phone: "0912-000-101", lineLinked: true },
    { id: "cus-chen", shopId: SHOP, name: "陳先生", phone: "0928-000-202", lineLinked: true },
    { id: "cus-chang", shopId: SHOP, name: "張太太", phone: "0933-000-303", lineLinked: false },
    { id: "cus-huang", shopId: SHOP, name: "黃先生", phone: "0955-000-404", lineLinked: true },
    { id: "cus-wu", shopId: SHOP, name: "吳小姐", phone: "0966-000-505", lineLinked: true },
    { id: "cus-lee", shopId: SHOP, name: "李先生", phone: "0977-000-606", lineLinked: false },
    { id: "cus-chou", shopId: SHOP, name: "周小姐", phone: "0988-000-707", lineLinked: true },
    { id: "cus-liu", shopId: SHOP, name: "劉小姐", phone: "0911-000-808", lineLinked: false },
  ];

  const pet = (p: Partial<Pet> & Pick<Pet, "id" | "primaryCustomerId" | "name">): Pet => ({
    shopId: SHOP, species: "dog", breed: null, sex: "unknown", birthdate: null, birthdateEstimated: false, neutered: null,
    coatColor: null, microchipMasked: null, photoUrl: null, groomingPreferences: null, productPreferences: null, estimatedMinutes: null, ...p,
  });

  const pets: Pet[] = [
    pet({ id: "pet-coco", primaryCustomerId: "cus-lin", name: "Coco", breed: "貴賓（玩具型）", sex: "female", birthdate: "2020-03-12", neutered: true, coatColor: "杏色", microchipMasked: "•••• •••• 3381", photoUrl: photo("coco-poodle"), groomingPreferences: "臉修圓、耳朵留長；腳毛修短露出腳型；尾巴留球", productPreferences: "低敏燕麥洗毛精（飼主自備）", estimatedMinutes: 120 }),
    pet({ id: "pet-naicha", primaryCustomerId: "cus-chang", name: "奶茶", breed: "柴犬", sex: "male", birthdate: "2022-06-01", neutered: true, coatColor: "奶油色", photoUrl: photo("naicha-shiba"), groomingPreferences: "換毛季加強除廢毛", estimatedMinutes: 60 }),
    pet({ id: "pet-lucky", primaryCustomerId: "cus-huang", name: "Lucky", breed: "米克斯", sex: "male", birthdate: "2019-01-01", birthdateEstimated: true, neutered: true, coatColor: "黑褐", photoUrl: photo("lucky-mix"), estimatedMinutes: 75 }),
    pet({ id: "pet-coco-2", primaryCustomerId: "cus-chen", name: "Coco", breed: "瑪爾濟斯", sex: "female", birthdate: "2023-02-14", neutered: false, coatColor: "白色", photoUrl: photo("coco-maltese"), estimatedMinutes: 60 }),
    pet({ id: "pet-pudding", primaryCustomerId: "cus-chen", name: "布丁", species: "cat", breed: "英國短毛貓", sex: "male", birthdate: "2021-09-09", neutered: true, coatColor: "藍灰", photoUrl: photo("pudding-cat"), estimatedMinutes: 90 }),
    pet({ id: "pet-mochi", primaryCustomerId: "cus-wu", name: "麻糬", breed: "博美", sex: "female", birthdate: "2021-11-20", neutered: true, coatColor: "橘色", photoUrl: photo("mochi-pomeranian"), estimatedMinutes: 120 }),
    pet({ id: "pet-doudou", primaryCustomerId: "cus-lee", name: "豆豆", breed: "迷你雪納瑞", sex: "male", birthdate: "2018-05-05", neutered: true, coatColor: "椒鹽", photoUrl: photo("doudou-schnauzer"), estimatedMinutes: 60 }),
    pet({ id: "pet-toast", primaryCustomerId: "cus-chou", name: "吐司", breed: "柯基", sex: "male", birthdate: "2022-12-24", neutered: false, coatColor: "三色", photoUrl: photo("toast-corgi"), estimatedMinutes: 120 }),
    // No photo, no weight, no birthdate — exercises the fallback states.
    pet({ id: "pet-orange", primaryCustomerId: "cus-liu", name: "橘子", breed: null, sex: "unknown" }),
  ];

  const weights: WeightRecord[] = [
    { id: "w1", petId: "pet-coco", weightKg: 5.0, measuredAt: at("2026-07-20", "14:10"), recordedBy: "Amy" },
    { id: "w2", petId: "pet-coco", weightKg: 4.9, measuredAt: at("2026-09-16", "14:05"), recordedBy: "Amy" },
    { id: "w3", petId: "pet-coco", weightKg: 4.8, measuredAt: at("2026-10-14", "10:20"), recordedBy: "May" },
    { id: "w4", petId: "pet-naicha", weightKg: 10.2, measuredAt: at("2026-09-30", "11:00"), recordedBy: "May" },
    { id: "w5", petId: "pet-lucky", weightKg: 14.6, measuredAt: at(T, "13:35"), recordedBy: "May" },
    { id: "w6", petId: "pet-coco-2", weightKg: 3.1, measuredAt: at("2026-08-02", "10:00"), recordedBy: "Amy" },
    { id: "w7", petId: "pet-pudding", weightKg: 5.6, measuredAt: at("2026-06-11", "15:00"), recordedBy: "May" },
    { id: "w8", petId: "pet-mochi", weightKg: 3.4, measuredAt: at(T, "10:05"), recordedBy: "Amy" },
    { id: "w9", petId: "pet-doudou", weightKg: 7.2, measuredAt: at(T, "09:35"), recordedBy: "May" },
    { id: "w10", petId: "pet-toast", weightKg: 12.8, measuredAt: at("2026-09-02", "16:40"), recordedBy: "Amy" },
  ];

  const notes: PetNote[] = [
    { id: "n1", petId: "pet-coco", category: "skin", source: "owner_reported", body: "皮膚敏感，只用低敏洗毛精；背部易泛紅", severity: "high", updatedBy: "林小姐", updatedAt: at("2026-09-02", "19:30") },
    { id: "n2", petId: "pet-coco", category: "behavior", source: "groomer_observed", body: "怕吹風機，請用低風量並從後腿開始吹", severity: "high", updatedBy: "Amy", updatedAt: at("2026-10-14", "11:40") },
    { id: "n3", petId: "pet-coco", category: "behavior", source: "groomer_observed", body: "剪指甲會掙扎，需兩人協助保定", severity: "normal", updatedBy: "Amy", updatedAt: at("2026-08-20", "15:10") },
    { id: "n4", petId: "pet-naicha", category: "behavior", source: "groomer_observed", body: "碰後腳會想咬，保定時注意", severity: "high", updatedBy: "May", updatedAt: at("2026-09-30", "11:30") },
    { id: "n5", petId: "pet-lucky", category: "health", source: "owner_reported", body: "左後腿舊傷，抱上美容台時托住臀部", severity: "high", updatedBy: "黃先生", updatedAt: at("2026-05-18", "12:00") },
    { id: "n6", petId: "pet-pudding", category: "behavior", source: "owner_reported", body: "會緊張，請安排安靜時段", severity: "normal", updatedBy: "陳先生", updatedAt: at("2026-06-01", "20:00") },
    { id: "n7", petId: "pet-toast", category: "skin", source: "groomer_observed", body: "換毛季掉毛量大，耳內易有分泌物", severity: "normal", updatedBy: "Amy", updatedAt: at("2026-09-02", "17:00") },
  ];

  const media: PetMedia[] = [
    { id: "m1", petId: "pet-coco", appointmentId: "apt-coco-today", category: "before", url: photo("coco-poodle-before"), takenAt: at(T, "14:05"), caption: "到店時毛量" },
    { id: "m2", petId: "pet-coco", appointmentId: "apt-coco-0916", category: "after", url: photo("coco-poodle"), takenAt: at("2026-09-16", "16:00"), caption: "臉修圓、腳毛短" },
    { id: "m3", petId: "pet-coco", appointmentId: null, category: "avatar", url: photo("coco-poodle"), takenAt: at("2026-09-16", "16:00"), caption: null },
    { id: "m4", petId: "pet-coco", appointmentId: "apt-coco-1014", category: "care", url: photo("coco-poodle-before"), takenAt: at("2026-10-14", "11:30"), caption: "背部泛紅位置（美容師觀察，非診斷）" },
  ];

  type Seed = Omit<Appointment, "shopId" | "version" | "contractStatus" | "pickupExpectedAt" | "customerNote" | "finish" | "checkedInAt" | "serviceStartedAt" | "completedAt" | "cancelledReason" | "createdAt" | "bufferMinutes"> & Partial<Appointment>;
  const apt = (a: Seed): Appointment => ({
    shopId: SHOP, version: 1, contractStatus: "signed", pickupExpectedAt: null, customerNote: null, finish: null, checkedInAt: null,
    serviceStartedAt: null, completedAt: null, cancelledReason: null, createdAt: at("2026-10-20", "10:00"), bufferMinutes: 15, ...a,
  });

  const appointments: Appointment[] = [
    apt({ id: "apt-doudou", petId: "pet-doudou", customerId: "cus-lee", staffId: "stf-may", startsAt: at(T, "09:30"), endsAt: at(T, "10:30"), status: "completed", source: "staff", checkedInAt: at(T, "09:25"), serviceStartedAt: at(T, "09:35"), completedAt: at(T, "11:05"), finish: { finishedAt: at(T, "10:28"), outcome: "normal", note: null, incidentNote: null, ownerContact: null } }),
    apt({ id: "apt-mochi", petId: "pet-mochi", customerId: "cus-wu", staffId: "stf-amy", startsAt: at(T, "10:00"), endsAt: at(T, "12:00"), status: "completed", source: "online", checkedInAt: at(T, "09:58"), serviceStartedAt: at(T, "10:05"), completedAt: at(T, "12:40"), finish: { finishedAt: at(T, "11:52"), outcome: "normal", note: "尾巴打結已剃除，飼主同意", incidentNote: null, ownerContact: null } }),
    apt({ id: "apt-orange", petId: "pet-orange", customerId: "cus-liu", staffId: "stf-amy", startsAt: at(T, "12:30"), endsAt: at(T, "13:30"), status: "cancelled", source: "online", cancelledReason: "飼主臨時有事（電話告知）" }),
    apt({ id: "apt-lucky", petId: "pet-lucky", customerId: "cus-huang", staffId: "stf-may", startsAt: at(T, "13:30"), endsAt: at(T, "14:45"), status: "ready_pickup", source: "staff", version: 4, checkedInAt: at(T, "13:28"), serviceStartedAt: at(T, "13:35"), pickupExpectedAt: at(T, "16:00"), finish: { finishedAt: at(T, "14:50"), outcome: "normal", note: "全身除廢毛完成，左後腿已注意托住", incidentNote: null, ownerContact: null } }),
    apt({ id: "apt-coco-today", petId: "pet-coco", customerId: "cus-lin", staffId: "stf-amy", startsAt: at(T, "14:00"), endsAt: at(T, "16:00"), status: "in_service", source: "staff", version: 3, checkedInAt: at(T, "13:55"), serviceStartedAt: at(T, "14:02"), pickupExpectedAt: at(T, "16:30") }),
    apt({ id: "apt-naicha", petId: "pet-naicha", customerId: "cus-chang", staffId: "stf-may", startsAt: at(T, "15:30"), endsAt: at(T, "16:30"), status: "confirmed", source: "online", contractStatus: "pending" }),
    apt({ id: "apt-toast", petId: "pet-toast", customerId: "cus-chou", staffId: "stf-amy", startsAt: at(T, "16:30"), endsAt: at(T, "18:30"), status: "confirmed", source: "staff" }),
    apt({ id: "apt-pudding", petId: "pet-pudding", customerId: "cus-chen", staffId: "stf-may", startsAt: at(T, "17:00"), endsAt: at(T, "18:30"), status: "confirmed", source: "staff", bufferMinutes: 30 }),
    // Online requests waiting for confirmation (do not hold slots).
    apt({ id: "apt-req-coco2", petId: "pet-coco-2", customerId: "cus-chen", staffId: null, startsAt: at("2026-10-29", "10:00"), endsAt: at("2026-10-29", "11:00"), status: "pending", source: "online", contractStatus: "pending", customerNote: "第一次修剪，想剪短一點", createdAt: at(T, "08:12") }),
    apt({ id: "apt-req-lucky", petId: "pet-lucky", customerId: "cus-huang", staffId: "stf-amy", startsAt: at("2026-10-30", "11:00"), endsAt: at("2026-10-30", "12:15"), status: "pending", source: "online", createdAt: at(T, "12:47") }),
    // History
    apt({ id: "apt-coco-1014", petId: "pet-coco", customerId: "cus-lin", staffId: "stf-may", startsAt: at("2026-10-14", "10:00"), endsAt: at("2026-10-14", "11:00"), status: "completed", source: "staff", completedAt: at("2026-10-14", "12:10"), finish: { finishedAt: at("2026-10-14", "11:05"), outcome: "abnormal", note: null, incidentNote: "背部發現約 2cm 泛紅，未使用一般洗毛精；已拍照並建議飼主諮詢獸醫（非診斷）", ownerContact: "contacted" } }),
    apt({ id: "apt-coco-0916", petId: "pet-coco", customerId: "cus-lin", staffId: "stf-amy", startsAt: at("2026-09-16", "14:00"), endsAt: at("2026-09-16", "16:00"), status: "completed", source: "staff", completedAt: at("2026-09-16", "16:40"), finish: { finishedAt: at("2026-09-16", "15:58"), outcome: "normal", note: "臉修圓、腳毛修短", incidentNote: null, ownerContact: null } }),
    apt({ id: "apt-coco-0720", petId: "pet-coco", customerId: "cus-lin", staffId: "stf-amy", startsAt: at("2026-07-20", "14:00"), endsAt: at("2026-07-20", "16:00"), status: "completed", source: "online", completedAt: at("2026-07-20", "16:30"), finish: { finishedAt: at("2026-07-20", "15:55"), outcome: "normal", note: null, incidentNote: null, ownerContact: null } }),
    apt({ id: "apt-coco-0601", petId: "pet-coco", customerId: "cus-lin", staffId: "stf-amy", startsAt: at("2026-06-01", "10:00"), endsAt: at("2026-06-01", "12:00"), status: "no_show", source: "online" }),
    // Tomorrow, so the calendar has more than one day of data.
    apt({ id: "apt-tmr-naicha", petId: "pet-toast", customerId: "cus-chou", staffId: "stf-may", startsAt: at("2026-10-29", "14:00"), endsAt: at("2026-10-29", "15:00"), status: "confirmed", source: "staff" }),
  ];

  const svc = Object.fromEntries(services.map((s) => [s.id, s]));
  let n = 0;
  const item = (appointmentId: string, serviceId: string, approval: AppointmentItem["approval"] = "approved", price?: number): AppointmentItem => ({
    id: `itm-${++n}`, appointmentId, serviceId, name: svc[serviceId].name, priceSnapshot: price ?? svc[serviceId].basePrice, durationSnapshot: svc[serviceId].durationMinutes, approval,
  });
  const items: AppointmentItem[] = [
    item("apt-doudou", "svc-bath"),
    item("apt-mochi", "svc-bath-trim", "approved", 1000),
    item("apt-orange", "svc-bath"),
    item("apt-lucky", "svc-bath-brush"),
    item("apt-coco-today", "svc-bath-trim"),
    item("apt-coco-today", "add-nail", "pending_owner"),
    item("apt-naicha", "svc-bath"),
    item("apt-toast", "svc-bath-trim"),
    item("apt-pudding", "svc-cat-bath"),
    item("apt-req-coco2", "svc-bath"),
    item("apt-req-lucky", "svc-bath-brush"),
    item("apt-coco-1014", "svc-bath"),
    item("apt-coco-0916", "svc-bath-trim"),
    item("apt-coco-0720", "svc-bath-trim", "approved", 850),
    item("apt-coco-0601", "svc-bath-trim"),
    item("apt-tmr-naicha", "svc-bath"),
  ];

  const payments: PaymentTransaction[] = [
    { id: "pay-1", appointmentId: "apt-doudou", type: "payment", method: "cash", amount: 700, idempotencyKey: "seed-1", note: null, createdAt: at(T, "11:04"), createdBy: "Iris" },
    { id: "pay-2", appointmentId: "apt-mochi", type: "payment", method: "transfer", amount: 1000, idempotencyKey: "seed-2", note: "末五碼 10233", createdAt: at(T, "12:38"), createdBy: "Iris" },
    { id: "pay-3", appointmentId: "apt-coco-1014", type: "payment", method: "cash", amount: 700, idempotencyKey: "seed-3", note: null, createdAt: at("2026-10-14", "12:08"), createdBy: "Iris" },
    { id: "pay-4", appointmentId: "apt-coco-0916", type: "payment", method: "external_card", amount: 900, idempotencyKey: "seed-4", note: "外部刷卡機", createdAt: at("2026-09-16", "16:38"), createdBy: "Iris" },
    { id: "pay-5", appointmentId: "apt-coco-0720", type: "payment", method: "cash", amount: 850, idempotencyKey: "seed-5", note: null, createdAt: at("2026-07-20", "16:28"), createdBy: "王怡君" },
  ];

  const notifications: NotificationJob[] = [
    { id: "ntf-lucky", appointmentId: "apt-lucky", kind: "ready_pickup", channel: "line_mock", status: "sent", attempts: 1, lastError: null, updatedAt: at(T, "14:51") },
    { id: "ntf-coco2", appointmentId: "apt-req-coco2", kind: "booking_received", channel: "line_mock", status: "sent", attempts: 1, lastError: null, updatedAt: at(T, "08:12") },
  ];

  const ev = (appointmentId: string, kind: AppointmentEvent["kind"], actorName: string, time: string, summary: string, date = T): AppointmentEvent => ({
    id: `evt-${++n}`, appointmentId, kind, actorName, at: at(date, time), summary,
  });
  const events: AppointmentEvent[] = [
    ev("apt-lucky", "created", "Iris", "10:00", "櫃檯建立預約", "2026-10-21"),
    ev("apt-lucky", "status_changed", "Iris", "13:28", "已報到：核對毛孩與注意事項"),
    ev("apt-lucky", "status_changed", "May", "13:35", "開始美容"),
    ev("apt-lucky", "finish_recorded", "May", "14:50", "完成美容（正常）"),
    ev("apt-lucky", "notification", "系統", "14:51", "待接回通知已送出（LINE 模擬）"),
    ev("apt-coco-today", "created", "Iris", "10:00", "櫃檯建立預約", "2026-10-20"),
    ev("apt-coco-today", "status_changed", "Iris", "13:55", "已報到：飼主確認低敏洗毛精"),
    ev("apt-coco-today", "status_changed", "Amy", "14:02", "開始美容"),
    ev("apt-coco-today", "addon_requested", "Amy", "14:30", "加購「指甲修剪」NT$100，等待飼主同意"),
    ev("apt-naicha", "requested", "張太太", "21:14", "飼主線上申請", "2026-10-25"),
    ev("apt-naicha", "confirmed", "Iris", "09:20", "櫃檯確認並指派 May", "2026-10-26"),
    ev("apt-req-coco2", "requested", "陳先生", "08:12", "飼主線上申請"),
    ev("apt-req-lucky", "requested", "黃先生", "12:47", "飼主線上申請（指定 Amy）"),
    ev("apt-orange", "cancelled", "Iris", "09:10", "取消：飼主臨時有事（電話告知）"),
  ];

  const hours: OperatingHours[] = [
    { weekday: 0, opens: "10:00", closes: "18:00" },
    { weekday: 1, opens: null, closes: null },
    { weekday: 2, opens: "09:00", closes: "19:00" },
    { weekday: 3, opens: "09:00", closes: "19:00" },
    { weekday: 4, opens: "09:00", closes: "19:00" },
    { weekday: 5, opens: "09:00", closes: "19:00" },
    { weekday: 6, opens: "10:00", closes: "18:00" },
  ];
  const breaks: StaffBreak[] = [
    { staffId: "stf-amy", starts: "12:00", ends: "12:30", label: "午休" },
    { staffId: "stf-may", starts: "12:30", ends: "13:00", label: "午休" },
  ];
  const timeOff: TimeOff[] = [
    { id: "off-amy-1030", staffId: "stf-amy", startsAt: at("2026-10-30", "09:00"), endsAt: at("2026-10-30", "19:00"), reason: "Amy 特休" },
  ];

  return {
    shop, staff, services, customers, pets, weights, notes, media, appointments, items, events, payments, notifications,
    hours, breaks, timeOff, clientRequestIds: {}, seq: 1000, clockOffsetMin: 0,
  };
}
