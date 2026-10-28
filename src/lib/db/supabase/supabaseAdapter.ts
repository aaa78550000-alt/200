// Supabase adapter (M1+): real Auth, Postgres with RLS, private Storage.
// Every mutation is an `app.*` RPC that re-validates role, tenant, version and business rules server-side.
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { DomainError, type AppointmentDetail, type DataAdapter, type DomainErrorCode, type PetDetail } from "../adapter";
import type { ScheduleContext } from "@/lib/domain/availability";
import { DEMO_PHOTOS } from "@/assets/pets";
import { paymentStatus } from "@/lib/domain/money";
import { hmFromMinutes, minutesOf } from "@/lib/domain/time";
import type {
  Appointment,
  AppointmentEvent,
  AppointmentItem,
  AppointmentView,
  Customer,
  NotificationJob,
  PaymentTransaction,
  Pet,
  PetMedia,
  PetNote,
  PetView,
  Role,
  Service,
  Session,
  Shop,
  Staff,
  WeightRecord,
} from "@/lib/domain/types";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CODES: DomainErrorCode[] = ["CONFLICT", "VERSION_MISMATCH", "INVALID_TRANSITION", "FORBIDDEN", "OFFLINE", "SLOT_TAKEN", "OTP_INVALID", "NOT_FOUND", "VALIDATION", "UNAUTHENTICATED", "RATE_LIMITED", "NO_SHOP"];

function toDomainError(e: PostgrestError | Error | null | undefined): DomainError {
  if (!e) return new DomainError("VALIDATION", "未知錯誤");
  const pe = e as PostgrestError;
  if (pe.hint && (CODES as string[]).includes(pe.hint)) return new DomainError(pe.hint as DomainErrorCode, pe.message, pe.details ? pe.details.split("\n").filter(Boolean) : undefined);
  if (pe.code === "42501" || pe.code === "PGRST301") return new DomainError("FORBIDDEN", "沒有權限執行這個操作");
  // .single() after a write that RLS filtered out → nothing was changed
  if (pe.code === "PGRST116") return new DomainError("FORBIDDEN", "沒有權限，或資料已不存在；沒有任何變更。");
  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(e.message)) return new DomainError("OFFLINE", OFFLINE_MSG);
  return new DomainError("VALIDATION", e.message);
}

const OFFLINE_MSG = "無法連線到伺服器，這個操作沒有送出。";

/**
 * Every backend call goes through here: refuse immediately when the browser is offline, and never wait forever
 * (supabase-js can stall in its auth layer while offline). PostgREST builders are lazy, so nothing is sent if we throw first.
 */
async function must<T>(p: PromiseLike<{ data: T | null; error: PostgrestError | null }>, timeoutMs = 20_000): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new DomainError("OFFLINE", OFFLINE_MSG);
  let res: { data: T | null; error: PostgrestError | null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    res = await Promise.race([
      Promise.resolve(p),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DomainError("OFFLINE", "伺服器沒有回應，這個操作的結果未確認，請重新整理確認狀態後再試。")), timeoutMs);
      }),
    ]);
  } catch (e) {
    throw e instanceof DomainError ? e : toDomainError(e as Error);
  } finally {
    clearTimeout(timer);
  }
  if (res.error) throw toDomainError(res.error);
  return res.data as T;
}

const PET_COLS = "id, shop_id, primary_customer_id, name, species, breed, sex, birthdate, birthdate_estimated, neutered, coat_color, photo_key, grooming_preferences, product_preferences, estimated_minutes";

export function createSupabaseAdapter(): DataAdapter {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new Error("缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY（見 .env.example）");
  // Fail fast when offline and never hang forever: a pending spinner must resolve into a visible error (E17).
  const guardedFetch: typeof fetch = async (input, init) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new TypeError("Failed to fetch (offline)");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    init?.signal?.addEventListener("abort", () => ctl.abort());
    try {
      return await fetch(input, { ...init, signal: ctl.signal });
    } catch (e) {
      throw new TypeError(`Failed to fetch: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  };
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: guardedFetch } });
  const app = () => sb.schema("app");
  let ctx: { session: Session; shop: Shop } | null = null;
  const signed = new Map<string, { url: string; exp: number }>();

  async function session(): Promise<{ session: Session; shop: Shop }> {
    if (ctx) return ctx;
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new DomainError("UNAUTHENTICATED", "請先登入");
    const memberships = await must(sb.from("shop_memberships").select("shop_id, role, status").eq("user_id", data.user.id).eq("status", "active"));
    if (!memberships.length) throw new DomainError("NO_SHOP", "這個帳號還沒有建立或加入任何店家");
    const m = memberships[0] as Row;
    const shopRow = (await must(sb.from("shops").select("*").eq("id", m.shop_id).single())) as Row;
    const profile = (await must(sb.from("user_profiles").select("display_name").eq("user_id", data.user.id).maybeSingle())) as Row | null;
    const staff = (await must(sb.from("staff_profiles").select("id").eq("shop_id", m.shop_id).eq("user_id", data.user.id).maybeSingle())) as Row | null;
    ctx = {
      session: { staffId: staff?.id ?? data.user.id, displayName: profile?.display_name ?? data.user.email ?? "", role: m.role as Role, shopId: m.shop_id },
      shop: { id: shopRow.id, slug: shopRow.slug, name: shopRow.name, timezone: shopRow.timezone, phone: shopRow.phone ?? "", address: shopRow.address ?? "", bookingNotice: shopRow.booking_notice },
    };
    devMode = !!shopRow.dev_mode;
    return ctx;
  }
  let devMode = false;
  const listeners = new Set<() => void>();

  /** demo:<file> keys point at bundled fictional demo images; real keys get a 10-minute signed URL from the private bucket. */
  async function photoUrls(keys: (string | null)[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const need: string[] = [];
    for (const k of new Set(keys.filter(Boolean) as string[])) {
      if (k.startsWith("demo:")) out.set(k, DEMO_PHOTOS[k.slice(5)] ?? "");
      else {
        const c = signed.get(k);
        if (c && c.exp > Date.now()) out.set(k, c.url);
        else need.push(k);
      }
    }
    if (need.length) {
      const { data } = await sb.storage.from("pet-media").createSignedUrls(need, 600);
      data?.forEach((d) => {
        if (d.signedUrl && d.path) {
          out.set(d.path, d.signedUrl);
          signed.set(d.path, { url: d.signedUrl, exp: Date.now() + 540_000 });
        }
      });
    }
    return out;
  }

  const mapPet = (r: Row, urls: Map<string, string>): Pet => ({
    id: r.id, shopId: r.shop_id, primaryCustomerId: r.primary_customer_id, name: r.name, species: r.species, breed: r.breed, sex: r.sex,
    birthdate: r.birthdate, birthdateEstimated: r.birthdate_estimated, neutered: r.neutered, coatColor: r.coat_color, microchipMasked: null,
    photoUrl: r.photo_key ? urls.get(r.photo_key) ?? null : null, groomingPreferences: r.grooming_preferences, productPreferences: r.product_preferences, estimatedMinutes: r.estimated_minutes,
  });
  const mapCustomer = (r: Row): Customer => ({ id: r.id, shopId: r.shop_id, name: r.name, phone: r.phone.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1-$2-$3"), lineLinked: r.line_linked });
  const mapNote = (r: Row): PetNote => ({ id: r.id, petId: r.pet_id, category: r.category, source: r.source, body: r.body, severity: r.severity, updatedBy: r.updated_by_name, updatedAt: r.updated_at });
  const mapWeight = (r: Row): WeightRecord => ({ id: r.id, petId: r.pet_id, weightKg: Number(r.weight_kg), measuredAt: r.measured_at, recordedBy: r.recorded_by_name });
  const mapItem = (r: Row): AppointmentItem => ({ id: r.id, appointmentId: r.appointment_id, serviceId: r.service_id, name: r.name, priceSnapshot: r.price_snapshot, durationSnapshot: r.duration_snapshot, approval: r.approval });
  const mapPayment = (r: Row): PaymentTransaction => ({ id: r.id, appointmentId: r.appointment_id, type: r.type, method: r.method, amount: r.amount_ntd, idempotencyKey: r.idempotency_key, note: r.note, createdAt: r.created_at, createdBy: r.created_by_name });
  const mapJob = (r: Row): NotificationJob => ({ id: r.id, appointmentId: r.appointment_id, kind: r.kind, channel: "line_mock", status: r.status, attempts: r.attempts, lastError: r.last_error, updatedAt: r.updated_at });
  const mapApt = (r: Row): Appointment => ({
    id: r.id, shopId: r.shop_id, petId: r.pet_id, customerId: r.customer_id, staffId: r.staff_id, startsAt: r.starts_at, endsAt: r.ends_at, bufferMinutes: r.buffer_minutes,
    status: r.status, version: r.version, source: r.source, contractStatus: r.contract_status, pickupExpectedAt: r.pickup_expected_at, customerNote: r.customer_note,
    finish: r.finished_at ? { finishedAt: r.finished_at, outcome: r.finish_outcome, note: r.finish_note, incidentNote: r.incident_note, ownerContact: r.owner_contact } : null,
    checkedInAt: r.checked_in_at, serviceStartedAt: r.service_started_at, completedAt: r.completed_at, cancelledReason: r.cancelled_reason, createdAt: r.created_at,
  });

  async function staffList(): Promise<Staff[]> {
    const { session: s } = await session();
    const [rows, links, members] = await Promise.all([
      must(sb.from("staff_profiles").select("*").eq("shop_id", s.shopId).eq("active", true).order("display_name")),
      must(sb.from("staff_services").select("staff_id, service_id").eq("shop_id", s.shopId)),
      must(sb.from("shop_memberships").select("user_id, role").eq("shop_id", s.shopId)).catch(() => [] as Row[]),
    ]);
    return (rows as Row[]).map((r) => ({
      id: r.id, shopId: r.shop_id, displayName: r.display_name, isGroomer: r.is_groomer, color: r.color,
      role: ((members as Row[]).find((m) => m.user_id === r.user_id)?.role ?? "groomer") as Role,
      serviceIds: (links as Row[]).filter((l) => l.staff_id === r.id).map((l) => l.service_id),
    }));
  }

  /** Loads appointments with everything list screens need, in a fixed number of queries. */
  async function views(filter: (q: any) => any): Promise<AppointmentView[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { session: s } = await session();
    const rows = (await must(filter(sb.from("appointment_overview").select("*").eq("shop_id", s.shopId)).order("starts_at"))) as Row[];
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const petIds = [...new Set(rows.map((r) => r.pet_id))];
    const custIds = [...new Set(rows.map((r) => r.customer_id))];
    const [pets, custs, items, pays, jobs, notes, staff] = await Promise.all([
      must(sb.from("pets").select(PET_COLS).in("id", petIds)),
      must(sb.from("customers").select("*").in("id", custIds)),
      must(sb.from("appointment_items").select("*").in("appointment_id", ids).order("created_at")),
      must(sb.from("payment_transactions").select("*").in("appointment_id", ids).order("created_at")),
      must(sb.from("notification_jobs").select("*").in("appointment_id", ids)),
      must(sb.from("pet_notes").select("*").in("pet_id", petIds).eq("severity", "high").order("updated_at", { ascending: false })),
      staffList(),
    ]);
    const urls = await photoUrls((pets as Row[]).map((p) => p.photo_key));
    return rows.map((r) => {
      const its = (items as Row[]).filter((i) => i.appointment_id === r.id).map(mapItem);
      const ps = (pays as Row[]).filter((p) => p.appointment_id === r.id).map(mapPayment);
      return {
        ...mapApt(r),
        pet: mapPet((pets as Row[]).find((p) => p.id === r.pet_id)!, urls),
        customer: mapCustomer((custs as Row[]).find((c) => c.id === r.customer_id)!),
        staff: staff.find((x) => x.id === r.staff_id) ?? null,
        items: its,
        payments: ps,
        notifications: (jobs as Row[]).filter((j) => j.appointment_id === r.id).map(mapJob),
        totalDue: r.total_due,
        paidAmount: r.paid_net,
        paymentStatus: paymentStatus(r.total_due, ps),
        highNotes: (notes as Row[]).filter((n) => n.pet_id === r.pet_id).map(mapNote),
      };
    });
  }

  async function petViews(rows: Row[]): Promise<PetView[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [custs, weights, notes, urls] = await Promise.all([
      must(sb.from("customers").select("*").in("id", [...new Set(rows.map((r) => r.primary_customer_id))])),
      must(sb.from("pet_weight_records").select("*").in("pet_id", ids).order("measured_at", { ascending: false })),
      must(sb.from("pet_notes").select("*").in("pet_id", ids).order("updated_at", { ascending: false })),
      photoUrls(rows.map((r) => r.photo_key)),
    ]);
    return rows.map((r) => {
      const ns = (notes as Row[]).filter((n) => n.pet_id === r.id).map(mapNote);
      return {
        ...mapPet(r, urls),
        customer: mapCustomer((custs as Row[]).find((c) => c.id === r.primary_customer_id)!),
        latestWeight: ((weights as Row[]).find((w) => w.pet_id === r.id) && mapWeight((weights as Row[]).find((w) => w.pet_id === r.id)!)) || null,
        notes: ns.sort((a, b) => Number(b.severity === "high") - Number(a.severity === "high")),
      };
    });
  }

  /** The outbox worker is a separate process in production; in dev_mode we drive the mock worker after commits. */
  let kickTimer: ReturnType<typeof setTimeout> | null = null;
  function kickMockWorker() {
    if (!devMode || !ctx || kickTimer) return;
    const shopId = ctx.shop.id;
    kickTimer = setTimeout(async () => {
      kickTimer = null;
      const { data } = await app().rpc("dev_run_mock_notifications", { p_shop: shopId, p_fail: false });
      if (data) listeners.forEach((l) => l());
    }, 800);
  }

  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => must(app().rpc(fn, args)) as Promise<T>;

  const adapter: DataAdapter = {
    mode: "supabase",
    now: () => new Date().toISOString(),
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new DomainError(error.status === 400 ? "VALIDATION" : "OFFLINE", error.status === 400 ? "帳號或密碼不正確" : "無法連線到伺服器");
      ctx = null;
    },
    async signOut() {
      await sb.auth.signOut();
      ctx = null;
    },
    getSession: async () => (await session()).session,
    getShop: async () => (await session()).shop,
    listStaff: staffList,
    async listServices() {
      const { session: s } = await session();
      const rows = (await must(sb.from("services").select("*").eq("shop_id", s.shopId).eq("active", true).order("sort"))) as Row[];
      return rows.map((r): Service => ({ id: r.id, shopId: r.shop_id, name: r.name, description: r.description, basePrice: r.base_price, priceIsFrom: r.price_is_from, durationMinutes: r.duration_minutes, bufferMinutes: r.buffer_minutes, isAddon: r.is_addon, species: r.species, onlineBookable: r.online_bookable }));
    },
    async getScheduleContext(): Promise<ScheduleContext> {
      const { session: s } = await session();
      const from = new Date(Date.now() - 7 * 864e5).toISOString();
      const to = new Date(Date.now() + 90 * 864e5).toISOString();
      const [hours, breaks, off, apts, staff] = await Promise.all([
        must(sb.from("operating_hours").select("*").eq("shop_id", s.shopId)),
        must(sb.from("staff_breaks").select("*").eq("shop_id", s.shopId)),
        must(sb.from("time_off").select("*").eq("shop_id", s.shopId).gte("ends_at", from)),
        must(sb.from("appointments").select("*").eq("shop_id", s.shopId).gte("starts_at", from).lt("starts_at", to)),
        staffList(),
      ]);
      const hm = (t: string | null) => (t ? hmFromMinutes(minutesOf(t.slice(0, 5))) : null);
      return {
        hours: (hours as Row[]).map((h) => ({ weekday: h.weekday, opens: hm(h.opens), closes: hm(h.closes) })),
        breaks: (breaks as Row[]).map((b) => ({ staffId: b.staff_id, starts: b.starts.slice(0, 5), ends: b.ends.slice(0, 5), label: b.label })),
        timeOff: (off as Row[]).map((t) => ({ id: t.id, staffId: t.staff_id, startsAt: t.starts_at, endsAt: t.ends_at, reason: t.reason })),
        appointments: (apts as Row[]).map(mapApt),
        staff,
      };
    },
    listAppointments: ({ from, to }) => views((q) => q.gte("starts_at", from).lt("starts_at", to).neq("status", "pending")),
    listPendingRequests: () => views((q) => q.eq("status", "pending")),
    async getAppointment(id): Promise<AppointmentDetail> {
      const [v] = await views((q) => q.eq("id", id));
      if (!v) throw new DomainError("NOT_FOUND", "找不到這筆預約");
      if (v.notifications.some((n) => n.status === "queued")) kickMockWorker();
      const [events, media] = await Promise.all([
        must(sb.from("appointment_events").select("*").eq("appointment_id", id).order("at").order("id")),
        must(sb.from("pet_media").select("*").eq("appointment_id", id)),
      ]);
      const urls = await photoUrls((media as Row[]).map((m) => m.storage_key));
      return {
        ...v,
        events: (events as Row[]).map((e): AppointmentEvent => ({ id: String(e.id), appointmentId: e.appointment_id, kind: e.kind, actorName: e.actor_name, at: e.at, summary: e.summary })),
        media: (media as Row[]).map((m): PetMedia => ({ id: m.id, petId: m.pet_id, appointmentId: m.appointment_id, category: m.category, url: urls.get(m.storage_key) ?? "", takenAt: m.taken_at, caption: m.caption })),
      };
    },
    async searchPets(q) {
      const { session: s } = await session();
      const term = q.trim().replace(/[%,()]/g, "");
      let query = sb.from("pets").select(PET_COLS).eq("shop_id", s.shopId);
      if (term) {
        const digits = term.replace(/\D/g, "");
        const custQ = sb.from("customers").select("id").eq("shop_id", s.shopId);
        const custs = (await must(digits.length >= 3 && digits.length === term.replace(/[-\s]/g, "").length ? custQ.like("phone", `%${digits}%`) : custQ.ilike("name", `%${term}%`))) as Row[];
        const ors = [`name.ilike.%${term}%`, `breed.ilike.%${term}%`];
        if (custs.length) ors.push(`primary_customer_id.in.(${custs.map((c) => c.id).join(",")})`);
        query = query.or(ors.join(","));
      }
      const rows = (await must(query.order("name").limit(50))) as Row[];
      return petViews(rows);
    },
    async getPet(id): Promise<PetDetail> {
      const { session: s } = await session();
      const row = (await must(sb.from("pets").select(PET_COLS).eq("id", id).eq("shop_id", s.shopId).maybeSingle())) as Row | null;
      if (!row) throw new DomainError("NOT_FOUND", "找不到這隻毛孩");
      const [pv] = await petViews([row]);
      const [weights, media, appts, siblings, chip] = await Promise.all([
        must(sb.from("pet_weight_records").select("*").eq("pet_id", id).order("measured_at", { ascending: false })),
        must(sb.from("pet_media").select("*").eq("pet_id", id).order("taken_at", { ascending: false })),
        views((q) => q.eq("pet_id", id)),
        must(sb.from("pets").select("id, name, photo_key").eq("primary_customer_id", row.primary_customer_id).neq("id", id)),
        must(app().rpc("pet_microchip", { p_pet: id })) as Promise<string | null>,
      ]);
      const urls = await photoUrls([...(media as Row[]).map((m) => m.storage_key), ...(siblings as Row[]).map((x) => x.photo_key)]);
      return {
        ...pv,
        microchipMasked: chip,
        weights: (weights as Row[]).map(mapWeight),
        media: (media as Row[]).map((m) => ({ id: m.id, petId: m.pet_id, appointmentId: m.appointment_id, category: m.category, url: urls.get(m.storage_key) ?? "", takenAt: m.taken_at, caption: m.caption })),
        appointments: appts.sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
        siblings: (siblings as Row[]).map((x) => ({ id: x.id, name: x.name, photoUrl: x.photo_key ? urls.get(x.photo_key) ?? null : null })),
      };
    },
    async getCustomer(id) {
      return mapCustomer((await must(sb.from("customers").select("*").eq("id", id).single())) as Row);
    },
    async addWeight(petId, weightKg) {
      const { session: s } = await session();
      await must(sb.from("pet_weight_records").insert({ shop_id: s.shopId, pet_id: petId, weight_kg: weightKg }));
    },
    async addNote(petId, note) {
      const { session: s } = await session();
      await must(sb.from("pet_notes").insert({ shop_id: s.shopId, pet_id: petId, category: note.category, source: note.source, severity: note.severity, body: note.body.trim(), updated_by_name: s.displayName }));
    },
    async uploadPetMedia(petId, file, category, caption) {
      const { session: s } = await session();
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new DomainError("VALIDATION", "只接受 JPG、PNG 或 WebP 圖片");
      if (file.size > 5 * 1024 * 1024) throw new DomainError("VALIDATION", "圖片需小於 5MB");
      const ext = file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${s.shopId}/${petId}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from("pet-media").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new DomainError("FORBIDDEN", `上傳失敗：${up.error.message}`);
      await must(sb.from("pet_media").insert({ shop_id: s.shopId, pet_id: petId, category, storage_key: path, caption: caption?.trim() || null }));
    },
    async findCustomerByPhone(phone) {
      const { session: s } = await session();
      const digits = phone.replace(/\D/g, "");
      if (!/^09\d{8}$/.test(digits)) return null;
      const r = (await must(sb.from("customers").select("*").eq("shop_id", s.shopId).eq("phone", digits).maybeSingle())) as Row | null;
      return r ? mapCustomer(r) : null;
    },
    async createCustomerPet(input) {
      const { session: s } = await session();
      return rpc("create_customer_pet", {
        p_shop: s.shopId, p_customer_id: input.customerId ?? null, p_customer_name: input.customerName ?? null, p_phone: input.phone ?? null,
        p_pet_name: input.petName, p_species: input.species, p_breed: input.breed ?? null, p_sex: input.sex ?? "unknown", p_birthdate: input.birthdate || null, p_weight: input.weightKg ?? null,
      });
    },
    async saveService(input) {
      const { session: s } = await session();
      const row = { shop_id: s.shopId, name: input.name.trim(), description: input.description, base_price: input.basePrice, price_is_from: input.priceIsFrom, duration_minutes: input.durationMinutes, buffer_minutes: input.bufferMinutes, is_addon: input.isAddon, species: input.species, online_bookable: input.onlineBookable };
      if (input.id) await must(sb.from("services").update(row).eq("id", input.id).select("id").single());
      else await must(sb.from("services").insert(row).select("id").single());
    },
    // Services referenced by historical items are archived, never deleted (snapshots keep history intact).
    archiveService: async (id) => void (await must(sb.from("services").update({ active: false }).eq("id", id).select("id").single())),
    async setOperatingHours(hours) {
      const { session: s } = await session();
      await must(sb.from("operating_hours").upsert(hours.map((h) => ({ shop_id: s.shopId, weekday: h.weekday, opens: h.opens, closes: h.closes }))).select("weekday"));
    },
    async setStaffServices(staffId, serviceIds) {
      const { session: s } = await session();
      await must(sb.from("staff_services").delete().eq("staff_id", staffId).select("staff_id"));
      if (serviceIds.length) await must(sb.from("staff_services").insert(serviceIds.map((sid) => ({ shop_id: s.shopId, staff_id: staffId, service_id: sid }))).select("staff_id"));
    },
    async addTimeOff(input) {
      const rows = await rpc<Row[]>("add_time_off", { p_staff: input.staffId, p_starts: input.startsAt, p_ends: input.endsAt, p_reason: input.reason });
      return rows.map((r) => ({ id: r.id, startsAt: r.startsAt, status: r.status, petName: r.petName, customerName: r.customerName, customerPhone: String(r.customerPhone).replace(/^(\d{4})(\d{3})(\d{3})$/, "$1-$2-$3") }));
    },
    deleteTimeOff: async (id) => void (await must(sb.from("time_off").delete().eq("id", id).select("id").single())),
    async signUp(email, password) {
      const { error } = await sb.auth.signUp({ email, password });
      if (error) throw new DomainError("VALIDATION", error.message.includes("registered") ? "這個 Email 已註冊，請直接登入" : `註冊失敗：${error.message}`);
      ctx = null;
    },
    async createShop(input) {
      await rpc("create_shop", { p_name: input.name, p_slug: input.slug, p_display_name: input.displayName, p_is_groomer: input.isGroomer });
      ctx = null;
    },
    async createAppointment(input) {
      const { session: s } = await session();
      return mapApt(await rpc<Row>("create_appointment", { p_shop: s.shopId, p_pet: input.petId, p_staff: input.staffId, p_starts_at: input.startsAt, p_service_ids: input.serviceIds, p_client_request_id: input.clientRequestId }));
    },
    async confirmAppointment(id, version, staffId) {
      const r = mapApt(await rpc<Row>("confirm_appointment", { p_id: id, p_version: version, p_staff: staffId ?? null }));
      kickMockWorker();
      return r;
    },
    cancelAppointment: async (id, version, reason) => mapApt(await rpc<Row>("set_status", { p_id: id, p_version: version, p_to: "cancelled", p_reason: reason })),
    rescheduleAppointment: async (id, version, startsAt, staffId) => mapApt(await rpc<Row>("reschedule_appointment", { p_id: id, p_version: version, p_starts_at: startsAt, p_staff: staffId })),
    checkIn: async (id, version) => mapApt(await rpc<Row>("set_status", { p_id: id, p_version: version, p_to: "checked_in", p_reason: null })),
    startService: async (id, version) => mapApt(await rpc<Row>("set_status", { p_id: id, p_version: version, p_to: "in_service", p_reason: null })),
    markNoShow: async (id, version) => mapApt(await rpc<Row>("set_status", { p_id: id, p_version: version, p_to: "no_show", p_reason: null })),
    async finishService(id, version, record) {
      const r = mapApt(await rpc<Row>("finish_service", { p_id: id, p_version: version, p_outcome: record.outcome, p_note: record.note, p_incident: record.incidentNote, p_contact: record.ownerContact }));
      kickMockWorker();
      return r;
    },
    requestAddon: async (id, serviceId) => void (await rpc("request_addon", { p_id: id, p_service: serviceId })),
    decideAddon: async (_aid, itemId, approve) => void (await rpc("decide_addon", { p_item: itemId, p_approve: approve })),
    recordPayment: async (id, input) =>
      void (await rpc("record_payment", { p_id: id, p_type: input.type, p_method: input.method, p_amount: input.amount, p_key: input.idempotencyKey, p_note: input.note ?? null })),
    handover: async (id, version, unpaidReason) => mapApt(await rpc<Row>("handover", { p_id: id, p_version: version, p_unpaid_reason: unpaidReason ?? null })),
    async retryNotification(jobId) {
      await rpc("retry_notification", { p_job: jobId });
      kickMockWorker();
    },

    async getPublicBooking(slug) {
      const r = await rpc<Row>("public_booking_info", { p_slug: slug });
      return {
        shop: { id: r.shop.id, slug: r.shop.slug, name: r.shop.name, timezone: r.shop.timezone, phone: r.shop.phone ?? "", address: r.shop.address ?? "", bookingNotice: r.shop.bookingNotice },
        services: (r.services as Row[]).map((v): Service => ({ id: v.id, shopId: r.shop.id, name: v.name, description: v.description, basePrice: v.basePrice, priceIsFrom: v.priceIsFrom, durationMinutes: v.durationMinutes, bufferMinutes: v.bufferMinutes, isAddon: false, species: v.species, onlineBookable: true })),
        groomers: r.groomers,
        closedWeekdays: r.closedWeekdays,
      };
    },
    async getPublicSlots(slug, date, serviceId, staffId) {
      const rows = await rpc<Row[]>("public_slots", { p_slug: slug, p_date: date, p_service: serviceId, p_staff: staffId });
      return rows.map((r) => ({ time: r.slot_time, startsAt: new Date(r.starts_at).toISOString(), staffIds: r.staff_ids }));
    },
    requestOtp: (slug, phone) => rpc("request_otp", { p_slug: slug, p_phone: phone }),
    async verifyOtp(slug, phone, code) {
      const r = await rpc<Row>("verify_otp", { p_slug: slug, p_phone: phone, p_code: code });
      if (r.error) throw new DomainError("OTP_INVALID", "驗證碼不正確，請重新輸入");
      // Customers are anonymous: no signed photo URLs are issued to them.
      return { token: r.token, customerName: r.customerName, pets: (r.pets as Row[]).map((p) => ({ id: p.id, name: p.name, breed: p.breed, photoUrl: null })) };
    },
    async submitBookingRequest(input) {
      return rpc("submit_booking_request", {
        p_slug: input.shopSlug, p_service: input.serviceId, p_starts_at: input.startsAt, p_staff: input.staffId, p_client_request_id: input.clientRequestId,
        p_note: input.note ?? null, p_token: input.verifiedToken ?? null, p_pet: input.petId ?? null, p_new: input.newCustomer ?? null,
      });
    },
  };
  return adapter;
}
