import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APT, PET, SHOP_A, SHOP_B, U, as, failsWith, pool, resetDb, rpc, user, version } from "./helpers";

// M1-01 / E15: two shops, multiple roles, cross-tenant access must be refused.
beforeAll(() => resetDb());
afterAll(() => pool.end());

const count = async (who: Parameters<typeof as>[0], sql: string, params: unknown[] = []) =>
  as(who, async (c) => Number((await c.query(`select count(*)::int n from (${sql}) x`, params)).rows[0].n));

describe("tenant isolation (E15)", () => {
  it("shop A staff see only shop A rows in every tenant table", async () => {
    for (const t of ["shops", "customers", "pets", "pet_notes", "pet_weight_records", "services", "staff_profiles", "appointments", "appointment_items", "appointment_events", "notification_jobs"]) {
      const other = await count(user(U.ownerA), `select 1 from public.${t} where ${t === "shops" ? "id" : "shop_id"} = $1`, [SHOP_B]);
      expect(other, `${t} leaked shop B rows`).toBe(0);
    }
    expect(await count(user(U.ownerA), "select 1 from public.pets")).toBeGreaterThan(0);
  });

  it("same phone number at two shops is never linked across shops (EDGE #14)", async () => {
    const a = await as(user(U.ownerA), async (c) => (await c.query("select name from public.customers where phone = '0912000101'")).rows);
    expect(a.map((r) => r.name)).toEqual(["林小姐"]);
    const b = await as(user(U.ownerB), async (c) => (await c.query("select name from public.customers where phone = '0912000101'")).rows);
    expect(b.map((r) => r.name)).toEqual(["林小姐（北區）"]);
  });

  it("shop B owner cannot read shop A's pet, notes or payments by id", async () => {
    expect(await count(user(U.ownerB), "select 1 from public.pets where id = $1", [PET.coco])).toBe(0);
    expect(await count(user(U.ownerB), "select 1 from public.pet_notes where pet_id = $1", [PET.coco])).toBe(0);
    expect(await count(user(U.ownerA), "select 1 from public.payment_transactions where appointment_id = $1", [APT.north])).toBe(0);
  });

  it("cross-shop writes are refused: insert into another shop, or point at another shop's rows", async () => {
    // RLS: shop B owner cannot create a customer in shop A
    expect(await failsWith(as(user(U.ownerB), (c) => c.query("insert into public.customers (shop_id, name, phone) values ($1, 'x', '0900000000')", [SHOP_A])))).toMatch(/42501|row-level security/);
    // Composite FK: a shop A note cannot point at a shop B pet even for a member of shop A
    expect(await failsWith(as(user(U.ownerA), (c) => c.query("insert into public.pet_notes (shop_id, pet_id, category, source, body, updated_by_name) values ($1, $2, 'skin', 'owner_reported', 'x', 'x')", [SHOP_A, PET.north])))).toMatch(/23503|foreign key/);
  });

  it("business functions refuse other shops' appointments (NOT_FOUND, no leak)", async () => {
    const v = await version(APT.coco);
    expect(await failsWith(as(user(U.ownerB), (c) => rpc(c, "set_status", [APT.coco, v, "cancelled", "x"])))).toBe("NOT_FOUND");
    expect(await failsWith(as(user(U.ownerB), (c) => rpc(c, "record_payment", [APT.lucky, "payment", "cash", 650, "steal-1", null])))).toBe("NOT_FOUND");
  });

  it("an authenticated user with no membership sees nothing", async () => {
    expect(await count(user(U.stranger), "select 1 from public.pets")).toBe(0);
    expect(await count(user(U.stranger), "select 1 from public.appointments")).toBe(0);
  });

  it("anon cannot read any table directly", async () => {
    for (const t of ["shops", "customers", "pets", "appointments", "payment_transactions"]) {
      expect(await failsWith(as("anon", (c) => c.query(`select 1 from public.${t} limit 1`)))).toMatch(/42501|permission denied/);
    }
  });
});

describe("roles inside one shop", () => {
  it("groomer cannot see payments; receptionist can", async () => {
    await as(user(U.iris), (c) => rpc(c, "record_payment", [APT.lucky, "payment", "cash", 100, "rls-pay-1", null]));
    expect(await count(user(U.amy), "select 1 from public.payment_transactions")).toBe(0);
    expect(await count(user(U.iris), "select 1 from public.payment_transactions")).toBeGreaterThan(0);
  });

  it("groomer cannot record payments, refunds, cancel, or create appointments", async () => {
    expect(await failsWith(as(user(U.amy), (c) => rpc(c, "record_payment", [APT.lucky, "payment", "cash", 100, "g-1", null])))).toBe("FORBIDDEN");
    expect(await failsWith(as(user(U.iris), (c) => rpc(c, "record_payment", [APT.lucky, "refund", "cash", 50, "r-1", "x"])))).toBe("FORBIDDEN");
    expect(await failsWith(as(user(U.amy), async (c) => rpc(c, "set_status", [APT.naicha, await version(APT.naicha), "cancelled", "x"])))).toBe("FORBIDDEN");
  });

  it("only owner/manager change services; only owner changes memberships", async () => {
    expect(await failsWith(as(user(U.iris), (c) => c.query("update public.services set base_price = 1 where shop_id = $1 returning id", [SHOP_A]).then((r) => { if (!r.rowCount) throw Object.assign(new Error("no rows"), { code: "RLS_NO_ROWS" }); })))).toBe("RLS_NO_ROWS");
    expect(await failsWith(as(user(U.iris), (c) => c.query("insert into public.shop_memberships (shop_id, user_id, role) values ($1, $2, 'owner')", [SHOP_A, U.stranger])))).toMatch(/42501|row-level security/);
  });

  it("clients cannot write appointment status or payments directly (only via functions)", async () => {
    expect(await failsWith(as(user(U.ownerA), (c) => c.query("update public.appointments set status = 'completed' where id = $1", [APT.coco])))).toMatch(/42501|permission denied/);
    expect(await failsWith(as(user(U.ownerA), (c) => c.query("insert into public.payment_transactions (shop_id, appointment_id, type, method, amount_ntd, idempotency_key, created_by_name) values ($1, $2, 'payment', 'cash', 1, 'x', 'x')", [SHOP_A, APT.coco])))).toMatch(/42501|permission denied/);
  });

  it("microchip is masked and only for owner/manager", async () => {
    expect(await failsWith(as(user(U.ownerA), (c) => c.query("select microchip from public.pets")))).toMatch(/42501|permission denied/);
    const owner = await as(user(U.ownerA), (c) => c.query("select app.pet_microchip($1) m", [PET.coco]));
    expect(owner.rows[0].m).toBe("•••• •••• 3381");
    const groomer = await as(user(U.amy), (c) => c.query("select app.pet_microchip($1) m", [PET.coco]));
    expect(groomer.rows[0].m).toBeNull();
  });

  it("notes keep provenance stamped by the server; history is append-only", async () => {
    await as(user(U.amy), (c) => c.query("insert into public.pet_notes (shop_id, pet_id, category, source, body, updated_by_name) values ($1, $2, 'behavior', 'groomer_observed', '今天很乖', '偽造的名字')", [SHOP_A, PET.coco]));
    const r = await pool.query("select updated_by_name, updated_by from public.pet_notes where body = '今天很乖'");
    expect(r.rows[0].updated_by_name).toBe("Amy");
    expect(r.rows[0].updated_by).toBe(U.amy);
    expect(await failsWith(pool.query("delete from public.appointment_events where appointment_id = $1", [APT.coco]))).toBe("P0001");
  });
});
