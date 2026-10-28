import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APT, PET, SHOP_A, STAFF, SVC, U, as, failsWith, nextOpenDay, pool, resetDb, rpc, todayAt, user, version } from "./helpers";

beforeAll(() => resetDb());
afterAll(() => pool.end());

const owner = user(U.ownerA);
const iris = user(U.iris);
const amy = user(U.amy);

describe("M2-02 scheduling", () => {
  it("staff creates a confirmed appointment; same client request id is idempotent", async () => {
    const d = await nextOpenDay();
    const starts = await todayAt("10:00", d);
    const a1 = await as(iris, (c) => rpc<{ id: string; status: string }>(c, "create_appointment", [SHOP_A, PET.coco, STAFF.amy, starts, [SVC.bath], "create-req-0001"]));
    const a2 = await as(iris, (c) => rpc<{ id: string }>(c, "create_appointment", [SHOP_A, PET.coco, STAFF.amy, starts, [SVC.bath], "create-req-0001"]));
    expect(a1.status).toBe("confirmed");
    expect(a2.id).toBe(a1.id);
    const items = await pool.query("select price_snapshot, duration_snapshot from appointment_items where appointment_id = $1", [a1.id]);
    expect(items.rows).toEqual([{ price_snapshot: 700, duration_snapshot: 60 }]);
  });

  it("price snapshot is not changed by a later price edit", async () => {
    const d = await nextOpenDay();
    const a = await as(iris, async (c) => rpc<{ id: string }>(c, "create_appointment", [SHOP_A, PET.naicha, STAFF.may, await todayAt("09:00", d), [SVC.bath], "snap-req-0001"]));
    await as(owner, (c) => c.query("update public.services set base_price = 999 where id = $1", [SVC.bath]));
    const r = await pool.query("select price_snapshot from appointment_items where appointment_id = $1", [a.id]);
    expect(r.rows[0].price_snapshot).toBe(700);
    await as(owner, (c) => c.query("update public.services set base_price = 700 where id = $1", [SVC.bath]));
  });

  it("rejects overlaps (incl. buffer), breaks, closed hours and unqualified groomers with readable reasons", async () => {
    // Coco (Amy) today 14:00–16:00 + 15 buffer
    const err = await as(iris, async (c) => rpc(c, "create_appointment", [SHOP_A, PET.naicha, STAFF.amy, await todayAt("16:00"), [SVC.bath], "overlap-req-01"])).catch((e) => e);
    expect(err.hint).toBe("CONFLICT");
    expect(err.detail).toMatch(/重疊/);
    const d = await nextOpenDay();
    expect(await failsWith(as(iris, async (c) => rpc(c, "create_appointment", [SHOP_A, PET.naicha, STAFF.amy, await todayAt("12:00", d), [SVC.bath], "break-req-001"])))).toBe("CONFLICT");
    expect(await failsWith(as(iris, async (c) => rpc(c, "create_appointment", [SHOP_A, PET.naicha, STAFF.amy, await todayAt("18:30", d), [SVC.bath], "late-req-0001"])))).toBe("CONFLICT");
    expect(await failsWith(as(iris, async (c) => rpc(c, "create_appointment", [SHOP_A, PET.naicha, STAFF.may, await todayAt("10:00", d), [SVC.style], "qual-req-0001"])))).toBe("CONFLICT");
  });

  it("E05: two concurrent confirmations of the same slot → exactly one succeeds", async () => {
    const d = await nextOpenDay();
    const starts = await todayAt("15:00", d);
    // two online requests for the same groomer/time (pending does not hold the slot)
    const r1 = await as("anon", (c) => rpc<{ submit_booking_request: { appointmentId: string } }>(c, "submit_booking_request", ["calm-studio", SVC.bath, starts, STAFF.may, "race-request-1", null, null, null, JSON.stringify({ name: "甲", phone: "0900111001", petName: "甲甲" })]));
    const r2 = await as("anon", (c) => rpc<{ submit_booking_request: { appointmentId: string } }>(c, "submit_booking_request", ["calm-studio", SVC.bath, starts, STAFF.may, "race-request-2", null, null, null, JSON.stringify({ name: "乙", phone: "0900111002", petName: "乙乙" })]));
    const ids = [r1.submit_booking_request.appointmentId, r2.submit_booking_request.appointmentId];
    const results = await Promise.allSettled(ids.map((id) => as(iris, (c) => rpc(c, "confirm_appointment", [id, 1, null]))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.hint).toBe("CONFLICT");
    const confirmed = await pool.query("select count(*)::int n from appointments where id = any($1) and status = 'confirmed'", [ids]);
    expect(confirmed.rows[0].n).toBe(1);
  });

  it("E05 (stress): 8 parallel staff bookings into one slot → one row", async () => {
    const d = await nextOpenDay();
    const starts = await todayAt("17:00", d);
    const res = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => as(iris, (c) => rpc(c, "create_appointment", [SHOP_A, PET.lucky, STAFF.amy, starts, [SVC.bath], `stress-${i}-xxxx`]))));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("E06: time off blocks new confirmations; existing confirmed bookings stay and are reportable", async () => {
    const d = await nextOpenDay(2); // separate day: the leave must not affect other tests
    const starts = await todayAt("11:00", d);
    const a = await as(iris, (c) => rpc<{ id: string }>(c, "create_appointment", [SHOP_A, PET.toast, STAFF.may, starts, [SVC.bath], "timeoff-req-01"]));
    await as(owner, async (c) => c.query("insert into public.time_off (shop_id, staff_id, starts_at, ends_at, reason) values ($1, $2, $3, $4, 'May 臨時請假')", [SHOP_A, STAFF.may, await todayAt("09:00", d), await todayAt("19:00", d)]));
    // existing booking is NOT deleted
    expect((await pool.query("select status from appointments where id = $1", [a.id])).rows[0].status).toBe("confirmed");
    // the same rule engine reports it as affected
    const problems = await pool.query("select app.schedule_problems($1, $2, starts_at, ends_at, buffer_minutes, app.approved_service_ids(id), id) p from appointments where id = $3", [SHOP_A, STAFF.may, a.id]);
    expect(problems.rows[0].p.join()).toMatch(/休假/);
    // new booking into the leave is refused
    expect(await failsWith(as(iris, async (c) => rpc(c, "create_appointment", [SHOP_A, PET.naicha, STAFF.may, await todayAt("14:00", d), [SVC.bath], "timeoff-req-02"])))).toBe("CONFLICT");
  });

  it("E07: reschedule keeps the id, bumps version, writes history; stale version is refused", async () => {
    const v = await version(APT.toast);
    const d = await nextOpenDay();
    const r = await as(iris, async (c) => rpc<{ id: string; version: number }>(c, "reschedule_appointment", [APT.toast, v, await todayAt("13:00", d), STAFF.amy]));
    expect(r.id).toBe(APT.toast);
    expect(r.version).toBe(v + 1);
    const ev = await pool.query("select summary from appointment_events where appointment_id = $1 and kind = 'rescheduled'", [APT.toast]);
    expect(ev.rows[0].summary).toMatch(/^改期：/);
    expect(await failsWith(as(iris, async (c) => rpc(c, "reschedule_appointment", [APT.toast, v, await todayAt("15:00", d), STAFF.amy])))).toBe("VERSION_MISMATCH");
  });

  it("cancelled time is released immediately", async () => {
    const d = await nextOpenDay();
    const starts = await todayAt("17:30", d);
    const a = await as(iris, (c) => rpc<{ id: string }>(c, "create_appointment", [SHOP_A, PET.coco, STAFF.may, starts, [SVC.bath], "cancel-req-001"]));
    await as(iris, (c) => rpc(c, "set_status", [a.id, 1, "cancelled", "飼主來電取消"]));
    const b = await as(iris, (c) => rpc<{ status: string }>(c, "create_appointment", [SHOP_A, PET.naicha, STAFF.may, starts, [SVC.bath], "cancel-req-002"]));
    expect(b.status).toBe("confirmed");
  });
});

describe("M3-01 service workflow", () => {
  it("E08: confirmed → checked_in → in_service → ready_pickup with events and an outbox job", async () => {
    let v = await version(APT.naicha);
    await as(iris, (c) => rpc(c, "set_status", [APT.naicha, v++, "checked_in", null]));
    await as(amy, (c) => rpc(c, "set_status", [APT.naicha, v++, "in_service", null]));
    const r = await as(amy, (c) => rpc<{ status: string; finished_at: Date }>(c, "finish_service", [APT.naicha, v, "normal", "腳毛修短", null, null]));
    expect(r.status).toBe("ready_pickup");
    expect(r.finished_at).toBeTruthy();
    const ev = await pool.query("select kind from appointment_events where appointment_id = $1 order by at, id", [APT.naicha]);
    expect(ev.rows.map((x) => x.kind)).toEqual(expect.arrayContaining(["status_changed", "finish_recorded"]));
    const jobs = await pool.query("select status from notification_jobs where appointment_id = $1 and kind = 'ready_pickup'", [APT.naicha]);
    expect(jobs.rows).toEqual([{ status: "queued" }]);
  });

  it("double finish (stale version / already finished) is refused and records one event", async () => {
    const v = await version(APT.coco);
    await as(amy, (c) => rpc(c, "finish_service", [APT.coco, v, "normal", null, null, null]));
    expect(await failsWith(as(amy, (c) => rpc(c, "finish_service", [APT.coco, v, "normal", null, null, null])))).toBe("VERSION_MISMATCH");
    expect(await failsWith(as(amy, (c) => rpc(c, "finish_service", [APT.coco, v + 1, "normal", null, null, null])))).toBe("INVALID_TRANSITION");
    const n = await pool.query("select count(*)::int n from appointment_events where appointment_id = $1 and kind = 'finish_recorded'", [APT.coco]);
    expect(n.rows[0].n).toBe(1);
  });

  it("abnormal finish requires incident note + contact state", async () => {
    const d = await nextOpenDay();
    const a = await as(iris, async (c) => rpc<{ id: string }>(c, "create_appointment", [SHOP_A, PET.lucky, STAFF.amy, await todayAt("15:30", d), [SVC.bath], "abn-req-00001"]));
    await as(iris, (c) => rpc(c, "set_status", [a.id, 1, "checked_in", null]));
    await as(amy, (c) => rpc(c, "set_status", [a.id, 2, "in_service", null]));
    expect(await failsWith(as(amy, (c) => rpc(c, "finish_service", [a.id, 3, "abnormal", null, "", null])))).toBe("VALIDATION");
    const r = await as(amy, (c) => rpc<{ incident_note: string }>(c, "finish_service", [a.id, 3, "abnormal", null, "右耳紅點，已停止清耳", "contacted"]));
    expect(r.incident_note).toBe("右耳紅點，已停止清耳");
  });

  it("terminal states never go back to service", async () => {
    expect(await failsWith(as(iris, async (c) => rpc(c, "set_status", [APT.toast, await version(APT.toast), "in_service", null])))).toBe("INVALID_TRANSITION");
  });

  it("add-on is billable only after owner approval", async () => {
    const before = await pool.query("select (app.payment_summary($1)).total_due t", [APT.coco]);
    const item = await pool.query("select id from appointment_items where appointment_id = $1 and approval = 'pending_owner'", [APT.coco]);
    await as(amy, (c) => rpc(c, "decide_addon", [item.rows[0].id, true]));
    const after = await pool.query("select (app.payment_summary($1)).total_due t", [APT.coco]);
    expect(after.rows[0].t - before.rows[0].t).toBe(100);
  });

  it("E14: notification failure does not touch the appointment; retries are bounded", async () => {
    const statusBefore = (await pool.query("select status, version from appointments where id = $1", [APT.naicha])).rows[0];
    // treat this job as a real LINE job (the dev shop's jobs are line_mock, which the real worker never claims)
    await pool.query("update notification_jobs set channel = 'line' where appointment_id = $1 and kind = 'ready_pickup'", [APT.naicha]);
    const jobs = await pool.query("select * from app.claim_notification_jobs(50)");
    for (const j of jobs.rows) await pool.query("select app.complete_notification_job($1, false, 'LINE 503', null, false)", [j.id]);
    const job = (await pool.query("select status, attempts, last_error from notification_jobs where appointment_id = $1 and kind = 'ready_pickup'", [APT.naicha])).rows[0];
    expect(job.status).toBe("queued"); // auto-retry scheduled with backoff
    expect(job.last_error).toBe("LINE 503");
    const statusAfter = (await pool.query("select status, version from appointments where id = $1", [APT.naicha])).rows[0];
    expect(statusAfter).toEqual(statusBefore);
  });
});

describe("M3-02 payments", () => {
  it("E09/E10: paid but still in shop stays ready_pickup; handover completes", async () => {
    await as(iris, (c) => rpc(c, "record_payment", [APT.naicha, "payment", "cash", 700, "naicha-pay-1", null]));
    expect((await pool.query("select status from appointments where id = $1", [APT.naicha])).rows[0].status).toBe("ready_pickup");
    expect((await pool.query("select (app.payment_summary($1)).status s", [APT.naicha])).rows[0].s).toBe("paid");
    const r = await as(iris, async (c) => rpc<{ status: string }>(c, "handover", [APT.naicha, await version(APT.naicha), null]));
    expect(r.status).toBe("completed");
  });

  it("E11: partial payment, refund; refund cannot exceed paid; status derived from ledger", async () => {
    await as(iris, (c) => rpc(c, "record_payment", [APT.lucky, "payment", "transfer", 300, "lucky-pay-1", "末五碼 12345"]));
    expect((await pool.query("select (app.payment_summary($1)).status s", [APT.lucky])).rows[0].s).toBe("partially_paid");
    await as(iris, (c) => rpc(c, "record_payment", [APT.lucky, "payment", "cash", 250, "lucky-pay-2", null]));
    await as(iris, (c) => rpc(c, "record_payment", [APT.lucky, "payment", "cash", 100, "lucky-pay-3", null]));
    expect((await pool.query("select (app.payment_summary($1)).status s", [APT.lucky])).rows[0].s).toBe("paid");
    expect(await failsWith(as(owner, (c) => rpc(c, "record_payment", [APT.lucky, "refund", "cash", 9999, "lucky-ref-x", "x"])))).toBe("VALIDATION");
    expect(await failsWith(as(owner, (c) => rpc(c, "record_payment", [APT.lucky, "refund", "cash", 100, "lucky-ref-y", ""])))).toBe("VALIDATION");
    await as(owner, (c) => rpc(c, "record_payment", [APT.lucky, "refund", "cash", 100, "lucky-ref-1", "梳毛時間縮短"]));
    const s = (await pool.query("select (app.payment_summary($1)).* from (select 1) x", [APT.lucky])).rows[0];
    expect(s).toMatchObject({ total_due: 650, paid: 650, refunded: 100, status: "partially_refunded" });
  });

  it("E12: the same idempotency key in parallel creates one transaction; reuse for another amount is refused", async () => {
    const d = await nextOpenDay();
    const a = await as(iris, async (c) => rpc<{ id: string }>(c, "create_appointment", [SHOP_A, PET.toast, STAFF.may, await todayAt("11:00", d), [SVC.bath], "idem-req-0001"]));
    const res = await Promise.allSettled(Array.from({ length: 5 }, () => as(iris, (c) => rpc(c, "record_payment", [a.id, "payment", "cash", 700, "same-key-0001", null]))));
    expect(res.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    const n = await pool.query("select count(*)::int n, sum(amount_ntd)::int s from payment_transactions where appointment_id = $1", [a.id]);
    expect(n.rows[0]).toEqual({ n: 1, s: 700 });
    expect(await failsWith(as(iris, (c) => rpc(c, "record_payment", [a.id, "payment", "cash", 1, "same-key-0001", null])))).toBe("VALIDATION");
  });

  it("ledger rows are immutable", async () => {
    expect(await failsWith(pool.query("update payment_transactions set amount_ntd = 1 where idempotency_key = 'lucky-pay-1'"))).toBe("P0001");
  });

  it("unpaid handover: receptionist refused; manager allowed with reason, audited", async () => {
    const d = await nextOpenDay();
    const a = await as(iris, async (c) => rpc<{ id: string }>(c, "create_appointment", [SHOP_A, PET.coco, STAFF.may, await todayAt("13:00", d), [SVC.bath], "unpaid-req-001"]));
    await as(iris, (c) => rpc(c, "set_status", [a.id, 1, "checked_in", null]));
    await as(iris, (c) => rpc(c, "set_status", [a.id, 2, "in_service", null]));
    await as(iris, (c) => rpc(c, "finish_service", [a.id, 3, "normal", null, null, null]));
    expect(await failsWith(as(iris, (c) => rpc(c, "handover", [a.id, 4, "月結"])))).toBe("FORBIDDEN");
    expect(await failsWith(as(owner, (c) => rpc(c, "handover", [a.id, 4, ""])))).toBe("VALIDATION");
    const r = await as(owner, (c) => rpc<{ status: string }>(c, "handover", [a.id, 4, "熟客月結"]));
    expect(r.status).toBe("completed");
    const audit = await pool.query("select action from audit_logs where target = $1", [a.id]);
    expect(audit.rows).toEqual([{ action: "handover_unpaid" }]);
  });
});
