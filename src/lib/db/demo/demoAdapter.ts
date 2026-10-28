// DEMO adapter: in-browser fixture store. Clearly labelled DEMO in the UI; never used for real data.
// It enforces the same business rules as the DB (transitions, versions, conflicts, idempotency)
// so the prototype cannot show success the backend would reject.
import { DomainError, type AppointmentDetail, type DataAdapter, type PetDetail } from "../adapter";
import { createFixtures, DEMO_NOW, type DemoDb } from "./fixtures";
import { appointmentsAffectedByTimeOff, bookableSlots, findConflicts, type ScheduleContext } from "@/lib/domain/availability";
import { can, canTransition, APPOINTMENT_LABEL, type Capability } from "@/lib/domain/status";
import { paidAmount, paymentStatus, totalDue, formatNtd } from "@/lib/domain/money";
import { addMinutes, dateOf, hhmm } from "@/lib/domain/time";
import type { Appointment, AppointmentEvent, AppointmentStatus, AppointmentView, NotificationJob, PetView, Role, Session } from "@/lib/domain/types";

const STORAGE_KEY = "petos-demo-v1";
const SETTINGS_KEY = "petos-demo-settings-v1";
const DEMO_OTP = "123456";

export interface DemoSettings {
  offline: boolean;
  lineFails: boolean;
  slotRace: boolean;
  role: Role;
  latencyMs: number;
}

const DEFAULT_SETTINGS: DemoSettings = { offline: false, lineFails: false, slotRace: false, role: "owner", latencyMs: 120 };
const ROLE_STAFF: Record<Role, string> = { owner: "stf-wang", manager: "stf-wang", receptionist: "stf-iris", groomer: "stf-amy" };

type Listener = () => void;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: demo still works in memory */
  }
}

export class DemoStore {
  db: DemoDb;
  settings: DemoSettings;
  private listeners = new Set<Listener>();

  constructor() {
    const raw = safeGet(STORAGE_KEY);
    this.db = raw ? (JSON.parse(raw) as DemoDb) : createFixtures();
    const s = safeGet(SETTINGS_KEY);
    this.settings = s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : { ...DEFAULT_SETTINGS };
  }
  save() {
    safeSet(STORAGE_KEY, JSON.stringify(this.db));
    safeSet(SETTINGS_KEY, JSON.stringify(this.settings));
    this.listeners.forEach((l) => l());
  }
  reset() {
    this.db = createFixtures();
    this.settings = { ...DEFAULT_SETTINGS, latencyMs: this.settings.latencyMs };
    this.save();
  }
  update(patch: Partial<DemoSettings>) {
    this.settings = { ...this.settings, ...patch };
    this.save();
  }
  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export function createDemoAdapter(store = new DemoStore()): DataAdapter & { store: DemoStore } {
  const db = () => store.db;
  const id = (prefix: string) => `${prefix}-${++store.db.seq}`;
  /** Deterministic demo clock: fixed "now", advanced one minute per mutation. */
  const now = () => addMinutes(DEMO_NOW, db().clockOffsetMin);
  const tick = () => {
    db().clockOffsetMin += 1;
    return now();
  };
  const wait = () => new Promise((r) => setTimeout(r, store.settings.latencyMs));

  const session = (): Session => {
    const staffId = ROLE_STAFF[store.settings.role];
    const s = db().staff.find((x) => x.id === staffId)!;
    return { userId: staffId, staffId, displayName: s.displayName, role: store.settings.role, shopId: db().shop.id };
  };

  async function read<T>(fn: () => T): Promise<T> {
    await wait();
    if (store.settings.offline) throw new DomainError("OFFLINE", "目前離線，無法取得最新資料");
    return structuredClone(fn());
  }
  /** `concurrent` runs first and is committed independently — it stands for another device's write. */
  async function write<T>(cap: Capability | null, fn: () => T, concurrent?: () => void): Promise<T> {
    await wait();
    if (store.settings.offline) throw new DomainError("OFFLINE", "目前離線，此操作沒有送出。請恢復網路後再試。");
    if (cap && !can(store.settings.role, cap)) throw new DomainError("FORBIDDEN", "目前的角色沒有這個操作權限");
    if (concurrent) {
      concurrent();
      store.save();
    }
    const snapshot = JSON.stringify(store.db);
    try {
      const out = fn();
      store.save();
      return structuredClone(out);
    } catch (e) {
      store.db = JSON.parse(snapshot); // transaction rollback
      throw e;
    }
  }

  const ctx = (): ScheduleContext => ({ hours: db().hours, breaks: db().breaks, timeOff: db().timeOff, appointments: db().appointments, staff: db().staff });

  function view(a: Appointment): AppointmentView {
    const d = db();
    const items = d.items.filter((i) => i.appointmentId === a.id);
    const payments = d.payments.filter((p) => p.appointmentId === a.id);
    const due = totalDue(items);
    return {
      ...a,
      pet: d.pets.find((p) => p.id === a.petId)!,
      customer: d.customers.find((c) => c.id === a.customerId)!,
      staff: d.staff.find((s) => s.id === a.staffId) ?? null,
      items,
      payments,
      notifications: d.notifications.filter((n) => n.appointmentId === a.id),
      totalDue: due,
      paidAmount: paidAmount(payments).net,
      paymentStatus: paymentStatus(due, payments),
      highNotes: d.notes.filter((n) => n.petId === a.petId && n.severity === "high"),
    };
  }

  function petView(petId: string): PetView {
    const d = db();
    const p = d.pets.find((x) => x.id === petId);
    if (!p) throw new DomainError("NOT_FOUND", "找不到這隻毛孩");
    const w = d.weights.filter((x) => x.petId === petId).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    return {
      ...p,
      customer: d.customers.find((c) => c.id === p.primaryCustomerId)!,
      latestWeight: w[0] ?? null,
      notes: d.notes.filter((n) => n.petId === petId).sort((a, b) => Number(b.severity === "high") - Number(a.severity === "high") || b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  function getApt(aid: string, version?: number): Appointment {
    const a = db().appointments.find((x) => x.id === aid);
    if (!a) throw new DomainError("NOT_FOUND", "找不到這筆預約");
    if (version !== undefined && a.version !== version)
      throw new DomainError("VERSION_MISMATCH", "這筆預約剛被其他人更新，畫面已重新整理，請確認後再操作。");
    return a;
  }

  function pushEvent(appointmentId: string, kind: AppointmentEvent["kind"], summary: string, actorName = session().displayName) {
    db().events.push({ id: id("evt"), appointmentId, kind, actorName, at: now(), summary });
  }

  function transition(a: Appointment, to: AppointmentStatus) {
    if (!canTransition(a.status, to))
      throw new DomainError("INVALID_TRANSITION", `「${APPOINTMENT_LABEL[a.status]}」不能直接變成「${APPOINTMENT_LABEL[to]}」`);
    a.status = to;
    a.version += 1;
  }

  function assertNoConflict(a: Pick<Appointment, "id" | "staffId" | "startsAt" | "endsAt" | "bufferMinutes">, serviceIds: string[]) {
    if (!a.staffId) throw new DomainError("VALIDATION", "請先指派美容師");
    const conflicts = findConflicts(ctx(), {
      staffId: a.staffId,
      startsAt: a.startsAt,
      durationMinutes: (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000,
      bufferMinutes: a.bufferMinutes,
      serviceIds,
      ignoreAppointmentId: a.id,
    });
    if (conflicts.length) throw new DomainError("CONFLICT", "這個時段無法安排", conflicts.map((c) => c.message));
  }

  /** Simulates other devices confirming bookings into the same slot first (DEMO tool, one-shot). */
  function simulateRace(staffIds: string[], startsAt: string, endsAt: string) {
    if (!store.settings.slotRace) return;
    store.settings = { ...store.settings, slotRace: false };
    for (const staffId of staffIds) {
      const rid = id("apt");
      db().appointments.push({
        id: rid, shopId: db().shop.id, petId: "pet-doudou", customerId: "cus-lee", staffId, startsAt, endsAt, bufferMinutes: 15,
        status: "confirmed", version: 1, source: "staff", contractStatus: "signed", pickupExpectedAt: null, customerNote: "（DEMO：另一台裝置搶先確認）",
        finish: null, checkedInAt: null, serviceStartedAt: null, completedAt: null, cancelledReason: null, createdAt: now(),
      });
      db().items.push({ id: id("itm"), appointmentId: rid, serviceId: "svc-bath", name: "基礎洗澡", priceSnapshot: 700, durationSnapshot: 60, approval: "approved" });
    }
  }

  function queueNotification(appointmentId: string, kind: NotificationJob["kind"]) {
    const job: NotificationJob = { id: id("ntf"), appointmentId, kind, channel: "line_mock", status: "queued", attempts: 0, lastError: null, updatedAt: now() };
    db().notifications.push(job);
    scheduleWorker(job.id);
  }

  /** Mock outbox worker: runs after the main transaction; failure never rolls back the appointment (E14). */
  function scheduleWorker(jobId: string) {
    setTimeout(() => {
      const job = db().notifications.find((n) => n.id === jobId);
      if (!job || job.status !== "queued") return;
      job.attempts += 1;
      job.updatedAt = now();
      if (store.settings.lineFails) {
        job.status = "failed";
        job.lastError = "LINE API 模擬錯誤 503（DEMO）";
        pushEvent(job.appointmentId, "notification", "通知送出失敗（LINE 模擬），可稍後重試", "系統");
      } else {
        job.status = "sent";
        job.lastError = null;
        pushEvent(job.appointmentId, "notification", "通知已送出（LINE 模擬；送出不代表已讀）", "系統");
      }
      store.save();
    }, 900);
  }

  const adapter: DataAdapter & { store: DemoStore } = {
    mode: "demo",
    store,
    now,
    getSession: () => read(session),
    getShop: () => read(() => db().shop),
    listStaff: () => read(() => db().staff),
    listServices: () => read(() => db().services),
    getScheduleContext: () => read(ctx),

    listAppointments: ({ from, to }) =>
      read(() =>
        db()
          .appointments.filter((a) => a.startsAt >= from && a.startsAt < to && a.status !== "pending")
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map(view),
      ),

    listPendingRequests: () =>
      read(() =>
        db()
          .appointments.filter((a) => a.status === "pending")
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map(view),
      ),

    getAppointment: (aid) =>
      read((): AppointmentDetail => {
        const a = getApt(aid);
        return {
          ...view(a),
          events: db().events.filter((e) => e.appointmentId === aid).sort((x, y) => x.at.localeCompare(y.at)),
          media: db().media.filter((m) => m.appointmentId === aid),
        };
      }),

    searchPets: (q) =>
      read(() => {
        const query = q.trim().toLowerCase().replace(/-/g, "");
        return db()
          .pets.map((p) => petView(p.id))
          .filter((p) => {
            if (!query) return true;
            return [p.name, p.breed ?? "", p.customer.name, p.customer.phone.replace(/-/g, "")].some((f) => f.toLowerCase().includes(query));
          })
          .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
      }),

    getPet: (pid) =>
      read((): PetDetail => {
        const pv = petView(pid);
        const d = db();
        return {
          ...pv,
          weights: d.weights.filter((w) => w.petId === pid).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)),
          media: d.media.filter((m) => m.petId === pid).sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
          appointments: d.appointments.filter((a) => a.petId === pid).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map(view),
          siblings: d.pets.filter((p) => p.primaryCustomerId === pv.primaryCustomerId && p.id !== pid).map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl })),
        };
      }),

    getCustomer: (cid) =>
      read(() => {
        const c = db().customers.find((x) => x.id === cid);
        if (!c) throw new DomainError("NOT_FOUND", "找不到飼主");
        return c;
      }),

    addWeight: (petId, weightKg) =>
      write("service.progress", () => {
        if (!db().pets.some((p) => p.id === petId)) throw new DomainError("NOT_FOUND", "找不到這隻毛孩");
        if (!(weightKg > 0 && weightKg < 120)) throw new DomainError("VALIDATION", "請輸入合理的體重（kg）");
        db().weights.push({ id: id("w"), petId, weightKg: Math.round(weightKg * 10) / 10, measuredAt: tick(), recordedBy: session().displayName });
      }),

    // DEMO: the image is kept as a data URL in this browser only (real uploads go to the private Storage bucket).
    uploadPetMedia: async (petId, file, category, caption) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new DomainError("VALIDATION", "只接受 JPG、PNG 或 WebP 圖片");
      if (file.size > 5 * 1024 * 1024) throw new DomainError("VALIDATION", "圖片需小於 5MB");
      const url = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new DomainError("VALIDATION", "讀取圖片失敗"));
        r.readAsDataURL(file);
      });
      return write("service.progress", () => {
        if (!db().pets.some((p) => p.id === petId)) throw new DomainError("NOT_FOUND", "找不到這隻毛孩");
        db().media.push({ id: id("m"), petId, appointmentId: null, category, url, takenAt: tick(), caption: caption?.trim() || null });
      });
    },

    addNote: (petId, note) =>
      write("service.progress", () => {
        if (!db().pets.some((p) => p.id === petId)) throw new DomainError("NOT_FOUND", "找不到這隻毛孩");
        if (!note.body.trim()) throw new DomainError("VALIDATION", "請填寫注意事項內容");
        const updatedBy = note.source === "owner_reported" ? `${session().displayName}（代記飼主說明）` : session().displayName;
        db().notes.push({ id: id("n"), petId, ...note, body: note.body.trim(), updatedBy, updatedAt: tick() });
      }),

    // DEMO: no real LINE account can be connected here — say so instead of pretending.
    getLineStatus: () => read(() => ({ configured: false, basicId: null, linkedCustomers: 0, webhookUrl: null })),
    setLineChannel: async () => {
      throw new DomainError("VALIDATION", "Demo 版不會連接真的 LINE 官方帳號；請在正式版（Supabase）設定。");
    },
    clearLineChannel: async () => {},
    createLinkCode: async () => {
      throw new DomainError("VALIDATION", "請先在「服務與設定」連接店家的 LINE 官方帳號（Demo 版不提供）");
    },
    getPublicLinkCode: async () => ({ available: false }),

    listStaffAccounts: () =>
      read(() =>
        db().staff.map((s) => ({ userId: s.id, displayName: s.displayName, email: `${s.id.replace("stf-", "")}@demo.petos`, role: s.role, active: true, isGroomer: s.isGroomer })),
      ),
    createStaffAccount: (input) =>
      write("settings.manage", () => {
        if (!input.displayName.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) throw new DomainError("VALIDATION", "請填寫稱呼與正確的 Email");
        if (input.password.length < 8) throw new DomainError("VALIDATION", "初始密碼至少 8 個字元");
        db().staff.push({ id: id("stf"), shopId: db().shop.id, displayName: input.displayName.trim(), role: input.role, isGroomer: input.isGroomer, serviceIds: [], color: "slate" });
      }),
    setStaffActive: async () => {
      throw new DomainError("VALIDATION", "Demo 版不提供停用帳號");
    },
    resetStaffPassword: async () => {
      throw new DomainError("VALIDATION", "Demo 版沒有真的帳號密碼");
    },

    findCustomerByPhone: (phone) =>
      read(() => db().customers.find((c) => c.phone.replace(/-/g, "") === phone.replace(/\D/g, "")) ?? null),

    createCustomerPet: (input) =>
      write("appointment.create", () => {
        if (!input.petName.trim()) throw new DomainError("VALIDATION", "請填寫毛孩名字");
        let customerId = input.customerId;
        if (customerId) {
          if (!db().customers.some((c) => c.id === customerId)) throw new DomainError("NOT_FOUND", "找不到飼主");
        } else {
          const digits = (input.phone ?? "").replace(/\D/g, "");
          if (!input.customerName?.trim() || !/^09\d{8}$/.test(digits)) throw new DomainError("VALIDATION", "請填寫飼主稱呼與 09 開頭的手機號碼");
          if (db().customers.some((c) => c.phone.replace(/-/g, "") === digits)) throw new DomainError("CONFLICT", "這支手機已有飼主資料，請改選既有飼主");
          customerId = id("cus");
          db().customers.push({ id: customerId, shopId: db().shop.id, name: input.customerName.trim(), phone: digits.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1-$2-$3"), lineLinked: false });
        }
        const petId = id("pet");
        db().pets.push({
          id: petId, shopId: db().shop.id, primaryCustomerId: customerId, name: input.petName.trim(), species: input.species, breed: input.breed?.trim() || null, sex: input.sex ?? "unknown",
          birthdate: input.birthdate || null, birthdateEstimated: false, neutered: null, coatColor: null, microchipMasked: null, photoUrl: null, groomingPreferences: null, productPreferences: null, estimatedMinutes: null,
        });
        if (input.weightKg && input.weightKg > 0) db().weights.push({ id: id("w"), petId, weightKg: input.weightKg, measuredAt: tick(), recordedBy: session().displayName });
        return { petId, customerId };
      }),

    saveService: (input) =>
      write("settings.manage", () => {
        if (!input.name.trim() || input.basePrice < 0 || input.durationMinutes < 5) throw new DomainError("VALIDATION", "請確認名稱、價格與時長");
        const existing = input.id ? db().services.find((s) => s.id === input.id) : undefined;
        if (existing) Object.assign(existing, { ...input, id: existing.id, shopId: existing.shopId });
        else db().services.push({ ...input, id: id("svc"), shopId: db().shop.id });
      }),

    archiveService: (sid) =>
      write("settings.manage", () => {
        db().services = db().services.filter((s) => s.id !== sid); // demo: historical items keep their snapshots
      }),

    setOperatingHours: (hours) =>
      write("settings.manage", () => {
        for (const h of hours) {
          if (h.opens && h.closes && h.opens >= h.closes) throw new DomainError("VALIDATION", "打烊時間需晚於開店時間");
          const row = db().hours.find((x) => x.weekday === h.weekday);
          if (row) Object.assign(row, h);
        }
      }),

    setStaffServices: (staffId, serviceIds) =>
      write("settings.manage", () => {
        const s = db().staff.find((x) => x.id === staffId);
        if (!s) throw new DomainError("NOT_FOUND", "找不到員工");
        s.serviceIds = [...serviceIds];
      }),

    addTimeOff: (input) =>
      write("settings.manage", () => {
        if (input.endsAt <= input.startsAt) throw new DomainError("VALIDATION", "結束時間需晚於開始時間");
        const t = { id: id("off"), staffId: input.staffId, startsAt: input.startsAt, endsAt: input.endsAt, reason: input.reason.trim() || "休假" };
        db().timeOff.push(t);
        const staff = db().staff.find((x) => x.id === input.staffId);
        const affected = appointmentsAffectedByTimeOff(ctx(), t).filter((a) => a.status === "pending" || a.status === "confirmed");
        affected.forEach((a) => pushEvent(a.id, "warning", `${staff?.displayName} 新增休假（${t.reason}），此預約需聯絡飼主改期或改派`));
        tick();
        return affected.map((a) => {
          const c = db().customers.find((x) => x.id === a.customerId)!;
          return { id: a.id, startsAt: a.startsAt, status: a.status, petName: db().pets.find((p) => p.id === a.petId)!.name, customerName: c.name, customerPhone: c.phone };
        });
      }),

    deleteTimeOff: (tid) =>
      write("settings.manage", () => {
        db().timeOff = db().timeOff.filter((t) => t.id !== tid);
      }),

    createAppointment: (input) =>
      write("appointment.create", () => {
        const existing = db().clientRequestIds[input.clientRequestId];
        if (existing) return getApt(existing);
        const pet = db().pets.find((p) => p.id === input.petId);
        if (!pet) throw new DomainError("NOT_FOUND", "找不到這隻毛孩");
        if (!input.serviceIds.length) throw new DomainError("VALIDATION", "請選擇服務");
        const svcs = input.serviceIds.map((sid) => db().services.find((s) => s.id === sid)!);
        const duration = svcs.reduce((s, x) => s + x.durationMinutes, 0);
        const buffer = Math.max(...svcs.map((s) => s.bufferMinutes));
        const a: Appointment = {
          id: id("apt"), shopId: db().shop.id, petId: pet.id, customerId: pet.primaryCustomerId, staffId: input.staffId, startsAt: input.startsAt,
          endsAt: addMinutes(input.startsAt, duration), bufferMinutes: buffer, status: "confirmed", version: 1, source: "staff", contractStatus: "pending",
          pickupExpectedAt: null, customerNote: null, finish: null, checkedInAt: null, serviceStartedAt: null, completedAt: null, cancelledReason: null, createdAt: tick(),
        };
        assertNoConflict(a, input.serviceIds);
        db().appointments.push(a);
        svcs.forEach((s) => db().items.push({ id: id("itm"), appointmentId: a.id, serviceId: s.id, name: s.name, priceSnapshot: s.basePrice, durationSnapshot: s.durationMinutes, approval: "approved" }));
        db().clientRequestIds[input.clientRequestId] = a.id;
        pushEvent(a.id, "created", `${session().displayName} 建立並確認預約`);
        return a;
      }),

    confirmAppointment: (aid, version, staffId) =>
      write("appointment.confirm", () => {
        const a = getApt(aid, version);
        if (staffId) a.staffId = staffId;
        assertNoConflict(a, db().items.filter((i) => i.appointmentId === aid && i.approval === "approved").map((i) => i.serviceId));
        transition(a, "confirmed");
        tick();
        const staff = db().staff.find((s) => s.id === a.staffId);
        pushEvent(aid, "confirmed", `確認預約並指派 ${staff?.displayName}`);
        queueNotification(aid, "booking_confirmed");
        return a;
      }, () => {
        const a = db().appointments.find((x) => x.id === aid);
        const sid = staffId ?? a?.staffId;
        if (a && sid) simulateRace([sid], a.startsAt, a.endsAt);
      }),

    cancelAppointment: (aid, version, reason) =>
      write("appointment.cancel", () => {
        if (!reason.trim()) throw new DomainError("VALIDATION", "請填寫取消原因");
        const a = getApt(aid, version);
        transition(a, "cancelled");
        a.cancelledReason = reason;
        tick();
        pushEvent(aid, "cancelled", `取消：${reason}`);
        return a;
      }),

    rescheduleAppointment: (aid, version, startsAt, staffId) =>
      write("appointment.reschedule", () => {
        const a = getApt(aid, version);
        if (!["pending", "confirmed"].includes(a.status)) throw new DomainError("INVALID_TRANSITION", "已報到或之後的預約不能改期");
        const duration = new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime();
        const before = `${dateOf(a.startsAt)} ${hhmm(a.startsAt)}`;
        const next = { ...a, startsAt, endsAt: new Date(new Date(startsAt).getTime() + duration).toISOString(), staffId };
        if (a.status === "confirmed") assertNoConflict(next, db().items.filter((i) => i.appointmentId === aid && i.approval === "approved").map((i) => i.serviceId));
        Object.assign(a, next, { version: a.version + 1 });
        tick();
        const staff = db().staff.find((s) => s.id === staffId);
        pushEvent(aid, "rescheduled", `改期：${before} → ${dateOf(startsAt)} ${hhmm(startsAt)}（${staff?.displayName}）`);
        return a;
      }),

    checkIn: (aid, version) =>
      write("service.progress", () => {
        const a = getApt(aid, version);
        transition(a, "checked_in");
        a.checkedInAt = tick();
        pushEvent(aid, "status_changed", "已報到：核對毛孩與注意事項");
        return a;
      }),

    startService: (aid, version) =>
      write("service.progress", () => {
        const a = getApt(aid, version);
        transition(a, "in_service");
        a.serviceStartedAt = tick();
        pushEvent(aid, "status_changed", "開始美容");
        return a;
      }),

    markNoShow: (aid, version) =>
      write("appointment.cancel", () => {
        const a = getApt(aid, version);
        transition(a, "no_show");
        tick();
        pushEvent(aid, "status_changed", "標記未到店");
        return a;
      }),

    finishService: (aid, version, record) =>
      write("service.progress", () => {
        const a = getApt(aid, version); // stale version → rejected, so a double tap cannot finish twice
        if (record.outcome === "abnormal" && (!record.incidentNote?.trim() || !record.ownerContact))
          throw new DomainError("VALIDATION", "異常完工需填寫狀況說明與飼主聯絡狀態");
        transition(a, "ready_pickup");
        a.finish = { ...record, finishedAt: tick() };
        pushEvent(aid, "finish_recorded", record.outcome === "normal" ? "完成美容（正常）" : "完成美容（異常，已記錄）");
        if (record.outcome === "abnormal") pushEvent(aid, "incident", `異常紀錄：${record.incidentNote}`);
        queueNotification(aid, "ready_pickup");
        return a;
      }),

    requestAddon: (aid, serviceId) =>
      write("service.progress", () => {
        const a = getApt(aid);
        if (a.status !== "in_service" && a.status !== "checked_in") throw new DomainError("INVALID_TRANSITION", "只有服務中可以提出加購");
        const s = db().services.find((x) => x.id === serviceId && x.isAddon);
        if (!s) throw new DomainError("NOT_FOUND", "找不到加購項目");
        db().items.push({ id: id("itm"), appointmentId: aid, serviceId, name: s.name, priceSnapshot: s.basePrice, durationSnapshot: s.durationMinutes, approval: "pending_owner" });
        tick();
        pushEvent(aid, "addon_requested", `加購「${s.name}」${formatNtd(s.basePrice)}，等待飼主同意`);
      }),

    decideAddon: (aid, itemId, approve) =>
      write("service.progress", () => {
        const it = db().items.find((i) => i.id === itemId && i.appointmentId === aid);
        if (!it || it.approval !== "pending_owner") throw new DomainError("VALIDATION", "這個加購已經處理過");
        it.approval = approve ? "approved" : "declined";
        tick();
        pushEvent(aid, "addon_decided", `飼主${approve ? "同意" : "不同意"}加購「${it.name}」（由 ${session().displayName} 記錄）`);
      }),

    recordPayment: (aid, input) =>
      write(input.type === "refund" ? "payment.refund" : "payment.record", () => {
        if (db().payments.some((p) => p.idempotencyKey === input.idempotencyKey)) return; // retry → no double charge (E12)
        const a = getApt(aid);
        if (!Number.isInteger(input.amount) || input.amount <= 0) throw new DomainError("VALIDATION", "金額需為正整數");
        if (["pending", "cancelled", "no_show"].includes(a.status)) throw new DomainError("INVALID_TRANSITION", "這筆預約目前不能收款");
        const pays = db().payments.filter((p) => p.appointmentId === aid);
        const { net } = paidAmount(pays);
        if (input.type === "refund" && input.amount > net) throw new DomainError("VALIDATION", `退款金額不可超過已收 ${formatNtd(net)}`);
        db().payments.push({ id: id("pay"), appointmentId: aid, type: input.type, method: input.method, amount: input.amount, idempotencyKey: input.idempotencyKey, note: input.note ?? null, createdAt: tick(), createdBy: session().displayName });
        pushEvent(aid, input.type === "refund" ? "refund" : "payment", `${input.type === "refund" ? "退款" : "收款"} ${formatNtd(input.amount)}（${({ cash: "現金", transfer: "轉帳", external_card: "外部刷卡" } as const)[input.method]}）${input.note ? `：${input.note}` : ""}`);
      }),

    handover: (aid, version, unpaidReason) =>
      write("service.progress", () => {
        const a = getApt(aid, version);
        const v = view(a);
        const owing = v.totalDue - v.paidAmount;
        if (owing > 0) {
          if (!can(store.settings.role, "handover.unpaid_authorize"))
            throw new DomainError("FORBIDDEN", `尚有 ${formatNtd(owing)} 未收，未付款交接需店長授權`);
          if (!unpaidReason?.trim()) throw new DomainError("VALIDATION", "未付款交接需填寫原因");
        }
        transition(a, "completed");
        a.completedAt = tick();
        if (owing > 0) pushEvent(aid, "handover_unpaid_authorized", `${session().displayName} 授權未付款交接（未收 ${formatNtd(owing)}）：${unpaidReason}`);
        pushEvent(aid, "handover", "飼主已接回，預約完成");
        return a;
      }),

    retryNotification: (jobId) =>
      write(null, () => {
        const job = db().notifications.find((n) => n.id === jobId);
        if (!job || job.status !== "failed") throw new DomainError("VALIDATION", "這個通知不需要重試");
        if (job.attempts >= 5) throw new DomainError("VALIDATION", "已達重試上限，請改用電話聯絡");
        job.status = "queued";
        job.updatedAt = tick();
        scheduleWorker(job.id);
      }),

    // ---------- Public booking (customer side) ----------
    getPublicBooking: (slug) =>
      read(() => {
        if (slug !== db().shop.slug) throw new DomainError("NOT_FOUND", "找不到這間店的預約頁");
        return {
          shop: db().shop,
          services: db().services.filter((s) => s.onlineBookable && !s.isAddon),
          groomers: db().staff.filter((s) => s.isGroomer).map((s) => ({ id: s.id, displayName: s.displayName })),
          closedWeekdays: db().hours.filter((h) => !h.opens).map((h) => h.weekday),
          returningVerification: "demo" as const,
          lineBasicId: null,
        };
      }),

    getPublicSlots: (slug, date, serviceId, staffId) =>
      read(() => {
        if (slug !== db().shop.slug) throw new DomainError("NOT_FOUND", "找不到預約頁");
        const s = db().services.find((x) => x.id === serviceId)!;
        return bookableSlots(ctx(), date, s, { now: now(), staffId });
      }),

    // Always answers "sent" so the endpoint cannot be used to test whether a phone is a customer (E18).
    requestOtp: (slug, phone) =>
      read(() => {
        if (slug !== db().shop.slug || !/^09\d{2}-?\d{3}-?\d{3}$/.test(phone)) throw new DomainError("VALIDATION", "請輸入正確的手機號碼（09 開頭 10 碼）");
        return { sent: true, channel: "demo" as const, demoCode: DEMO_OTP };
      }),

    verifyOtp: (slug, phone, code) =>
      read(() => {
        if (slug !== db().shop.slug) throw new DomainError("NOT_FOUND", "找不到預約頁");
        if (code !== DEMO_OTP) throw new DomainError("OTP_INVALID", "驗證碼不正確，請重新輸入");
        const norm = phone.replace(/-/g, "");
        const c = db().customers.find((x) => x.phone.replace(/-/g, "") === norm);
        return {
          token: `demo-otp:${norm}`,
          customerName: c?.name ?? "",
          pets: c ? db().pets.filter((p) => p.primaryCustomerId === c.id).map((p) => ({ id: p.id, name: p.name, breed: p.breed, photoUrl: p.photoUrl })) : [],
        };
      }),

    submitBookingRequest: (input) =>
      write(null, () => {
        const existing = db().clientRequestIds[input.clientRequestId];
        if (existing) return { appointmentId: existing, status: "pending" as const, duplicate: true };
        const s = db().services.find((x) => x.id === input.serviceId && x.onlineBookable);
        if (!s) throw new DomainError("VALIDATION", "請選擇服務");
        const endsAt = addMinutes(input.startsAt, s.durationMinutes);
        // Re-check against confirmed occupancy at submit time; the slot may have been taken since step 2.
        const stillOpen = bookableSlots(ctx(), dateOf(input.startsAt), s, { now: now(), staffId: input.staffId }).some((x) => x.startsAt === input.startsAt);
        if (!stillOpen) throw new DomainError("SLOT_TAKEN", "這個時段剛被預約走了，請改選其他時段。你填的資料都還在。");
        let customerId: string;
        let petId: string;
        if (input.verifiedToken) {
          const norm = input.verifiedToken.replace("demo-otp:", "");
          const c = db().customers.find((x) => x.phone.replace(/-/g, "") === norm);
          if (!c || !input.petId || !db().pets.some((p) => p.id === input.petId && p.primaryCustomerId === c.id))
            throw new DomainError("FORBIDDEN", "身分驗證已失效，請重新驗證");
          customerId = c.id;
          petId = input.petId;
        } else if (input.newCustomer) {
          const nc = input.newCustomer;
          if (!nc.name.trim() || !nc.petName.trim()) throw new DomainError("VALIDATION", "請填寫稱呼與毛孩名字");
          customerId = id("cus");
          db().customers.push({ id: customerId, shopId: db().shop.id, name: nc.name.trim(), phone: nc.phone, lineLinked: false });
          petId = id("pet");
          db().pets.push({
            id: petId, shopId: db().shop.id, primaryCustomerId: customerId, name: nc.petName.trim(), species: nc.species, breed: nc.breed?.trim() || null, sex: "unknown",
            birthdate: null, birthdateEstimated: false, neutered: null, coatColor: null, microchipMasked: null, photoUrl: null, groomingPreferences: null, productPreferences: null, estimatedMinutes: null,
          });
          if (nc.weightKg) db().weights.push({ id: id("w"), petId, weightKg: nc.weightKg, measuredAt: now(), recordedBy: "飼主自填" });
        } else throw new DomainError("VALIDATION", "請完成身分資料");
        const a: Appointment = {
          id: id("apt"), shopId: db().shop.id, petId, customerId, staffId: input.staffId, startsAt: input.startsAt, endsAt, bufferMinutes: s.bufferMinutes,
          status: "pending", version: 1, source: "online", contractStatus: "pending", pickupExpectedAt: null, customerNote: input.note?.trim() || null,
          finish: null, checkedInAt: null, serviceStartedAt: null, completedAt: null, cancelledReason: null, createdAt: tick(),
        };
        db().appointments.push(a);
        db().items.push({ id: id("itm"), appointmentId: a.id, serviceId: s.id, name: s.name, priceSnapshot: s.basePrice, durationSnapshot: s.durationMinutes, approval: "approved" });
        db().clientRequestIds[input.clientRequestId] = a.id;
        db().events.push({ id: id("evt"), appointmentId: a.id, kind: "requested", actorName: "飼主", at: now(), summary: "飼主線上申請" });
        queueNotification(a.id, "booking_received");
        return { appointmentId: a.id, status: "pending" as const, duplicate: false };
      }, () => {
        const s = db().services.find((x) => x.id === input.serviceId);
        if (s) simulateRace(input.staffId ? [input.staffId] : db().staff.filter((g) => g.isGroomer).map((g) => g.id), input.startsAt, addMinutes(input.startsAt, s.durationMinutes));
      }),
  };
  return adapter;
}
