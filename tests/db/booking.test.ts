import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APT, PET, SHOP_A, STAFF, SVC, U, as, failsWith, nextOpenDay, pool, resetDb, rpc, todayAt, user } from "./helpers";

beforeAll(() => resetDb());
afterAll(() => pool.end());

const call = <T>(fn: string, args: unknown[]) => as("anon", async (c) => Object.values(await rpc<Record<string, T>>(c, fn, args))[0] as T);

describe("public booking API (anon)", () => {
  it("shop card exposes only public fields", async () => {
    const info = await call<Record<string, unknown>>("public_booking_info", ["calm-studio"]);
    expect(Object.keys(info.shop as object).sort()).toEqual(["address", "bookingNotice", "id", "name", "phone", "slug", "timezone"]);
    expect((info.services as unknown[]).length).toBe(5); // add-ons are not bookable online
    expect(info.closedWeekdays).toEqual([1]);
    expect(await failsWith(call("public_booking_info", ["no-such-shop"]))).toBe("NOT_FOUND");
  });

  it("slots respect lead time, hours, breaks and confirmed occupancy; pending does not hold time", async () => {
    const d = await nextOpenDay();
    const date = (await pool.query(`select ((now() at time zone 'Asia/Taipei')::date + $1::int)::text d`, [d])).rows[0].d;
    const slots = (await as("anon", (c) => c.query("select * from app.public_slots('calm-studio', $1::date, $2, $3)", [date, SVC.bath, STAFF.amy]))).rows;
    const times = slots.map((s) => s.slot_time);
    expect(times).not.toContain("11:30"); // 11:30–12:30 crosses Amy's 12:00 break
    expect(times).toContain("10:00");
    // Seed has a pending request tomorrow 10:00 with no staff: still offered to others
    const anyStaff = (await as("anon", (c) => c.query("select * from app.public_slots('calm-studio', $1::date, $2, null)", [date, SVC.bath]))).rows;
    expect(anyStaff.length).toBeGreaterThan(times.length - 1);
  });

  it("E16: new customer request is pending, never confirmed; duplicate submit is deduped", async () => {
    const d = await nextOpenDay();
    const starts = await todayAt("10:00", d);
    const args = ["calm-studio", SVC.bath, starts, null, "booking-e16-0001", "怕吹風機", null, null, JSON.stringify({ name: "測試小姐", phone: "0900-123-456", petName: "湯圓", species: "dog" })];
    const r1 = await call<{ appointmentId: string; status: string; duplicate: boolean }>("submit_booking_request", args);
    expect(r1).toMatchObject({ status: "pending", duplicate: false });
    const r2 = await call<{ appointmentId: string; duplicate: boolean }>("submit_booking_request", args);
    expect(r2).toMatchObject({ appointmentId: r1.appointmentId, duplicate: true });
    const row = (await pool.query("select status, staff_id, customer_note from appointments where id = $1", [r1.appointmentId])).rows[0];
    expect(row).toMatchObject({ status: "pending", staff_id: null, customer_note: "怕吹風機" });
    // staff sees it
    const staffView = await as(user(U.iris), (c) => c.query("select 1 from appointments where id = $1", [r1.appointmentId]));
    expect(staffView.rowCount).toBe(1);
  });

  it("slot taken at submit time → SLOT_TAKEN (no request created)", async () => {
    const d = await nextOpenDay();
    const starts = await todayAt("16:00", d);
    await as(user(U.iris), (c) => rpc(c, "create_appointment", [SHOP_A, PET.toast, STAFF.amy, starts, [SVC.bath], "taken-amy-0001"]));
    await as(user(U.iris), (c) => rpc(c, "create_appointment", [SHOP_A, PET.naicha, STAFF.may, starts, [SVC.bath], "taken-may-0001"]));
    const before = (await pool.query("select count(*)::int n from appointments")).rows[0].n;
    expect(await failsWith(call("submit_booking_request", ["calm-studio", SVC.bath, starts, null, "booking-taken-01", null, null, null, JSON.stringify({ name: "甲", phone: "0900000111", petName: "甲" })]))).toBe("SLOT_TAKEN");
    expect((await pool.query("select count(*)::int n from appointments")).rows[0].n).toBe(before);
  });

  it("E18: OTP response is identical for known/unknown phones; wrong code reveals nothing; correct code returns only own pets", async () => {
    const known = await call<Record<string, unknown>>("request_otp", ["calm-studio", "0912-000-101"]);
    const unknown = await call<Record<string, unknown>>("request_otp", ["calm-studio", "0900-999-999"]);
    expect(Object.keys(known)).toEqual(Object.keys(unknown));
    const wrong = await call<Record<string, unknown>>("verify_otp", ["calm-studio", "0912-000-101", "000000"]);
    expect(wrong).toEqual({ error: "OTP_INVALID" });
    const ok = await call<{ token: string; customerName: string; pets: { id: string; name: string }[] }>("verify_otp", ["calm-studio", "0912-000-101", "123456"]);
    expect(ok.customerName).toBe("林小姐");
    expect(ok.pets.map((p) => p.name)).toEqual(["Coco"]);
    // the other shop's 林小姐 (same phone) is not returned
    expect(JSON.stringify(ok)).not.toContain("北區");
    // code is single-use
    expect(await failsWith(call("verify_otp", ["calm-studio", "0912-000-101", "123456"]))).toBe("OTP_INVALID");

    // returning customer books with the session token
    const d = await nextOpenDay();
    const r = await call<{ status: string }>("submit_booking_request", ["calm-studio", SVC.bath, await todayAt("11:00", d), null, "booking-returning1", null, ok.token, PET.coco, null]);
    expect(r.status).toBe("pending");
    // token cannot be used for someone else's pet
    expect(await failsWith(call("submit_booking_request", ["calm-studio", SVC.bath, await todayAt("14:00", d), null, "booking-forged-01", null, ok.token, PET.lucky, null]))).toBe("FORBIDDEN");
    expect(await failsWith(call("submit_booking_request", ["calm-studio", SVC.bath, await todayAt("14:00", d), null, "booking-forged-02", null, "deadbeef", PET.coco, null]))).toBe("FORBIDDEN");
  });

  it("OTP brute force is limited", async () => {
    await call("request_otp", ["calm-studio", "0900-555-555"]);
    for (let i = 0; i < 5; i++) await call("verify_otp", ["calm-studio", "0900-555-555", "11111" + i]);
    expect(await failsWith(call("verify_otp", ["calm-studio", "0900-555-555", "123456"]))).toBe("OTP_INVALID");
    for (let i = 0; i < 4; i++) await call("request_otp", ["calm-studio", "0900-555-555"]);
    expect(await failsWith(call("request_otp", ["calm-studio", "0900-555-555"]))).toBe("RATE_LIMITED");
  });

  it("a 'new customer' request using an existing phone never reveals or edits that customer's data", async () => {
    const d = await nextOpenDay();
    const r = await call<{ appointmentId: string }>("submit_booking_request", ["calm-studio", SVC.bath, await todayAt("09:00", d), null, "booking-imposter1", null, null, null, JSON.stringify({ name: "冒名者", phone: "0912000101", petName: "假Coco" })]);
    expect(JSON.stringify(r)).not.toContain("林小姐");
    const c = (await pool.query("select name from customers where phone = '0912000101' and shop_id = $1", [SHOP_A])).rows[0];
    expect(c.name).toBe("林小姐"); // not overwritten
    const note = (await pool.query("select customer_note from appointments where id = $1", [r.appointmentId])).rows[0].customer_note;
    expect(note).toMatch(/未驗證新客申請/);
  });

  it("anon cannot call staff functions", async () => {
    expect(await failsWith(as("anon", (c) => rpc(c, "set_status", [APT.coco, 1, "cancelled", "x"])))).toMatch(/42501|permission denied/);
    expect(await failsWith(as("anon", (c) => rpc(c, "record_payment", [APT.coco, "payment", "cash", 1, "anon-1", null])))).toMatch(/42501|permission denied/);
  });
});
