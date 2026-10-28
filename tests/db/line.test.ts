import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APT, SHOP_A, SHOP_B, U, as, failsWith, pool, resetDb, rpc, user, version } from "./helpers";

// M4-02 real LINE delivery: channel secrets never reach clients; jobs are honest about why nothing was sent.
beforeAll(() => resetDb());
afterAll(() => pool.end());

const SECRET = "0123456789abcdef0123456789abcdef";
const TOKEN = "T".repeat(60);
const LIN = "a7000000-0000-4000-a000-000000000001";

describe("LINE channel settings", () => {
  it("only the owner can connect; secrets are not readable by any client role", async () => {
    expect(await failsWith(as(user(U.iris), (c) => c.query("select app.set_line_channel($1, $2, $3, '@petostest')", [SHOP_A, SECRET, TOKEN])))).toBe("FORBIDDEN");
    expect(await failsWith(as(user(U.ownerA), (c) => c.query("select app.set_line_channel($1, 'short', 'short', '@x')", [SHOP_A])))).toBe("VALIDATION");
    await as(user(U.ownerA), (c) => c.query("select app.set_line_channel($1, $2, $3, '@petostest')", [SHOP_A, SECRET, TOKEN]));
    expect(await failsWith(as(user(U.ownerA), (c) => c.query("select * from public.shop_line_channels")))).toMatch(/42501|permission denied/);
    expect(await failsWith(as(user(U.ownerA), (c) => c.query("select app.line_channel($1)", [SHOP_A])))).toMatch(/42501|permission denied/);
    const st = (await as(user(U.amy), (c) => c.query("select app.line_status($1) s", [SHOP_A]))).rows[0].s;
    expect(st).toMatchObject({ configured: true, basicId: "@petostest", linkedCustomers: 0 });
    expect(JSON.stringify(st)).not.toContain(SECRET);
    expect(await failsWith(as(user(U.ownerB), (c) => c.query("select app.line_status($1)", [SHOP_A])))).toBe("NOT_FOUND");
  });

  it("public info advertises LINE verification only when connected", async () => {
    const a = (await as("anon", (c) => c.query("select app.public_booking_info('calm-studio') i"))).rows[0].i;
    expect(a).toMatchObject({ returningVerification: "line", lineBasicId: "@petostest" });
    await pool.query("update shops set dev_mode = false where id = $1", [SHOP_B]);
    const b = (await as("anon", (c) => c.query("select app.public_booking_info('north-paws') i"))).rows[0].i;
    expect(b.returningVerification).toBe("none");
    expect(await failsWith(as("anon", (c) => c.query("select app.request_otp('north-paws', '0912000101')")))).toBe("VALIDATION");
  });
});

describe("linking and delivery", () => {
  it("link code → webhook link → jobs become deliverable", async () => {
    // before linking: a real (non-demo) message for 林小姐 is recorded as not sent, with the reason
    await pool.query("update shops set dev_mode = false where id = $1", [SHOP_A]);
    const v = await version(APT.coco);
    await as(user(U.amy), (c) => rpc(c, "finish_service", [APT.coco, v, "normal", null, null, null]));
    const before = (await pool.query("select status, last_error, channel from notification_jobs where appointment_id = $1", [APT.coco])).rows[0];
    expect(before).toMatchObject({ status: "not_applicable", last_error: "飼主尚未綁定 LINE", channel: "line" });

    const code = (await as(user(U.iris), (c) => c.query("select app.create_link_code($1) r", [LIN]))).rows[0].r.code;
    expect(code).toMatch(/^\d{6}$/);
    expect(await failsWith(as(user(U.amy), (c) => c.query("select app.create_link_code($1)", [LIN])))).toBe("FORBIDDEN");
    // webhook (service role) with the wrong shop does nothing; the right one links
    expect((await pool.query("select app.line_link_customer($1, $2, 'Uabc') n", [SHOP_B, code])).rows[0].n).toBeNull();
    expect((await pool.query("select app.line_link_customer($1, $2, 'Uabc') n", [SHOP_A, code])).rows[0].n).toBe("林小姐");
    expect((await pool.query("select app.line_link_customer($1, $2, 'Uabc') n", [SHOP_A, code])).rows[0].n).toBeNull(); // single use

    // after linking, the worker can address 林小姐's chat with the shop's token
    const job = await pool.query("select app.notification_message(id) m from notification_jobs where appointment_id = $1", [APT.coco]);
    expect(job.rows[0].m).toMatchObject({ to: "Uabc", token: TOKEN });
    expect(job.rows[0].m.text).toContain("Coco 已完成美容");
  });

  it("OTP goes to the linked LINE chat; answer is identical for unknown phones; code is cleared after sending", async () => {
    const known = (await as("anon", (c) => c.query("select app.request_otp('calm-studio', '0912-000-101') r"))).rows[0].r;
    const unknown = (await as("anon", (c) => c.query("select app.request_otp('calm-studio', '0900-999-999') r"))).rows[0].r;
    expect(known).toEqual({ sent: true, channel: "line" });
    expect(unknown).toEqual(known);
    const otp = (await pool.query("select id, payload, status from notification_jobs where kind = 'otp'")).rows;
    expect(otp).toHaveLength(1);
    expect(otp[0].payload.code).toMatch(/^\d{6}$/);
    const msg = (await pool.query("select app.notification_message($1) m", [otp[0].id])).rows[0].m;
    expect(msg.text).toContain(otp[0].payload.code);
    // the worker would claim + complete it; completion wipes the code
    await pool.query("select * from app.claim_notification_jobs(50)");
    await pool.query("select app.complete_notification_job($1, true, null, null, false)", [otp[0].id]);
    expect((await pool.query("select payload, status from notification_jobs where id = $1", [otp[0].id])).rows[0]).toEqual({ payload: null, status: "sent" });
    // and the customer can verify with that code
    const res = (await as("anon", (c) => c.query("select app.verify_otp('calm-studio', '0912000101', $1) r", [otp[0].payload.code]))).rows[0].r;
    expect(res).toBeTruthy();
  });

  it("anonymous link code requires the submitting browser's request id", async () => {
    expect(await failsWith(as("anon", (c) => c.query("select app.public_link_code('calm-studio', $1, 'guessed-id')", ["a9000000-0000-4000-a000-000000000005"])))).toBe("NOT_FOUND");
  });
});

describe("staff accounts (service-role functions behind the staff-admin Edge Function)", () => {
  it("owner manages below owner; manager/receptionist limits; cannot disable self", async () => {
    const NEW = "00000000-0000-4000-a000-0000000000b1";
    await pool.query("insert into auth.users (id, email, aud, role) values ($1, 'staff-new@petos.test', 'authenticated', 'authenticated') on conflict do nothing", [NEW]);
    expect(await failsWith(pool.query("select app.add_staff_member($1, $2, $3, '新人', 'staff-new@petos.test', 'owner', true)", [SHOP_A, U.ownerA, NEW]))).toBe("FORBIDDEN");
    expect(await failsWith(pool.query("select app.add_staff_member($1, $2, $3, '新人', 'staff-new@petos.test', 'groomer', true)", [SHOP_A, U.iris, NEW]))).toBe("FORBIDDEN");
    expect(await failsWith(pool.query("select app.add_staff_member($1, $2, $3, '新人', 'staff-new@petos.test', 'groomer', true)", [SHOP_A, U.ownerB, NEW]))).toBe("FORBIDDEN");
    await pool.query("select app.add_staff_member($1, $2, $3, '新人', 'staff-new@petos.test', 'groomer', true)", [SHOP_A, U.ownerA, NEW]);
    const m = (await pool.query("select role, status from shop_memberships where shop_id = $1 and user_id = $2", [SHOP_A, NEW])).rows[0];
    expect(m).toEqual({ role: "groomer", status: "active" });
    await pool.query("select app.set_member_active($1, $2, $3, false)", [SHOP_A, U.ownerA, NEW]);
    expect((await as(user(NEW), (c) => c.query("select count(*)::int n from public.pets"))).rows[0].n).toBe(0); // disabled → sees nothing
    expect(await failsWith(pool.query("select app.set_member_active($1, $2, $2, false)", [SHOP_A, U.ownerA]))).toBe("VALIDATION");
    expect(await failsWith(pool.query("select app.assert_can_reset($1, $2, $3)", [SHOP_A, U.iris, U.amy]))).toBe("FORBIDDEN");
  });

  it("clients cannot call the staff functions directly", async () => {
    expect(await failsWith(as(user(U.ownerA), (c) => c.query("select app.add_staff_member($1, $2, $2, 'x', 'x@x.x', 'groomer', true)", [SHOP_A, U.ownerA])))).toMatch(/42501|permission denied/);
  });
});
