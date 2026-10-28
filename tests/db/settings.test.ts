import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APT, SHOP_A, SHOP_B, STAFF, SVC, U, as, failsWith, pool, resetDb, rpc, todayAt, user } from "./helpers";

beforeAll(() => resetDb());
afterAll(() => pool.end());

const NEW_USER = "00000000-0000-4000-a000-0000000000aa";

describe("E01 shop onboarding", () => {
  it("a new signed-in user creates a shop, becomes owner with default hours; slug must be unique", async () => {
    await pool.query("insert into auth.users (id, email, aud, role) values ($1, 'new-owner@petos.test', 'authenticated', 'authenticated') on conflict do nothing", [NEW_USER]);
    const shopId = await as(user(NEW_USER), async (c) => (await c.query("select app.create_shop('新店測試', 'new-shop-test', '新店長', true) id")).rows[0].id);
    const m = await pool.query("select role from shop_memberships where shop_id = $1 and user_id = $2", [shopId, NEW_USER]);
    expect(m.rows).toEqual([{ role: "owner" }]);
    const h = await pool.query("select count(*) filter (where opens is null)::int closed, count(*)::int n from operating_hours where shop_id = $1", [shopId]);
    expect(h.rows[0]).toEqual({ closed: 1, n: 7 });
    expect(await failsWith(as(user(NEW_USER), (c) => c.query("select app.create_shop('重複', 'calm-studio', 'x', false)")))).toBe("CONFLICT");
    expect(await failsWith(as(user(NEW_USER), (c) => c.query("select app.create_shop('壞網址', 'Bad Slug!', 'x', false)")))).toBe("VALIDATION");
    // the new owner sees only their own shop
    const shops = await as(user(NEW_USER), (c) => c.query("select slug from shops"));
    expect(shops.rows.map((r) => r.slug)).toEqual(["new-shop-test"]);
  });

  it("anon cannot create shops", async () => {
    expect(await failsWith(as("anon", (c) => c.query("select app.create_shop('x', 'anon-shop', 'x', false)")))).toMatch(/42501|permission denied/);
  });
});

describe("F02 staff creates owner + pet", () => {
  it("creates a new owner and pet; duplicate phone is refused; existing owner can be reused", async () => {
    const r = await as(user(U.iris), (c) => rpc<{ create_customer_pet: { petId: string; customerId: string } }>(c, "create_customer_pet", [SHOP_A, null, "新飼主", "0911-222-333", "小白", "dog", null, "unknown", null, 3.2]));
    expect(r.create_customer_pet.petId).toBeTruthy();
    expect(await failsWith(as(user(U.iris), (c) => rpc(c, "create_customer_pet", [SHOP_A, null, "另一位", "0911222333", "小黑", "dog", null, "unknown", null, null])))).toBe("CONFLICT");
    const r2 = await as(user(U.iris), (c) => rpc<{ create_customer_pet: { customerId: string } }>(c, "create_customer_pet", [SHOP_A, r.create_customer_pet.customerId, null, null, "小黑", "cat", "米克斯", "male", null, null]));
    expect(r2.create_customer_pet.customerId).toBe(r.create_customer_pet.customerId);
    // groomer cannot create owners
    expect(await failsWith(as(user(U.amy), (c) => rpc(c, "create_customer_pet", [SHOP_A, null, "x", "0911000999", "x", "dog", null, "unknown", null, null])))).toBe("FORBIDDEN");
    // cannot attach to another shop's customer
    expect(await failsWith(as(user(U.iris), (c) => rpc(c, "create_customer_pet", [SHOP_A, "b7000000-0000-4000-a000-000000000001", null, null, "x", "dog", null, "unknown", null, null])))).toBe("NOT_FOUND");
  });
});

describe("M2-01 settings", () => {
  it("receptionist/groomer cannot change hours, services or staff qualifications (RLS filters the write)", async () => {
    for (const who of [U.iris, U.amy]) {
      const r = await as(user(who), (c) => c.query("update public.operating_hours set opens = '06:00' where shop_id = $1 returning weekday", [SHOP_A]));
      expect(r.rowCount).toBe(0);
      const s = await as(user(who), (c) => c.query("update public.services set base_price = 1 where id = $1 returning id", [SVC.bath]));
      expect(s.rowCount).toBe(0);
      expect(await failsWith(as(user(who), (c) => c.query("insert into public.staff_services (shop_id, staff_id, service_id) values ($1, $2, $3)", [SHOP_A, STAFF.may, SVC.style])))).toMatch(/42501|row-level security/);
    }
    const owner = await as(user(U.ownerA), (c) => c.query("update public.operating_hours set opens = '09:30' where shop_id = $1 and weekday = 3 returning weekday", [SHOP_A]));
    expect(owner.rowCount).toBe(1);
  });

  it("another shop's owner cannot edit this shop's services", async () => {
    const r = await as(user(U.ownerB), (c) => c.query("update public.services set base_price = 1 where shop_id = $1 returning id", [SHOP_A]));
    expect(r.rowCount).toBe(0);
    expect(SHOP_B).toBeTruthy();
  });

  it("E06: leave over existing bookings returns them, writes a warning event, and does not cancel them", async () => {
    // Coco today 14:00–16:00 with Amy (in_service → not affected); 吐司 16:30 with Amy (confirmed → affected)
    const affected = await as(user(U.ownerA), async (c) => (await c.query("select app.add_time_off($1, $2, $3, '臨時看診') r", [STAFF.amy, await todayAt("16:00"), await todayAt("19:00")])).rows[0].r);
    expect(affected.map((a: { id: string }) => a.id)).toEqual([APT.toast]);
    expect(affected[0]).toMatchObject({ petName: "吐司", customerName: "周小姐" });
    const status = await pool.query("select status from appointments where id = $1", [APT.toast]);
    expect(status.rows[0].status).toBe("confirmed");
    const ev = await pool.query("select summary from appointment_events where appointment_id = $1 and kind = 'warning'", [APT.toast]);
    expect(ev.rows[0].summary).toMatch(/臨時看診/);
    expect(await failsWith(as(user(U.iris), async (c) => c.query("select app.add_time_off($1, $2, $3, 'x')", [STAFF.amy, await todayAt("10:00", 3), await todayAt("12:00", 3)])))).toBe("FORBIDDEN");
  });
});
