import { execFileSync } from "node:child_process";
import pg from "pg";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54329/postgres";

export const SHOP_A = "a0000000-0000-4000-a000-00000000000a";
export const SHOP_B = "b0000000-0000-4000-a000-00000000000b";
export const U = {
  ownerA: "00000000-0000-4000-a000-000000000001",
  amy: "00000000-0000-4000-a000-000000000002",
  may: "00000000-0000-4000-a000-000000000003",
  iris: "00000000-0000-4000-a000-000000000004",
  ownerB: "00000000-0000-4000-a000-000000000011",
  groomerB: "00000000-0000-4000-a000-000000000012",
  stranger: "00000000-0000-4000-a000-0000000000ff",
} as const;
export const STAFF = { amy: "a5000000-0000-4000-a000-000000000002", may: "a5000000-0000-4000-a000-000000000003", north: "b5000000-0000-4000-a000-000000000012" } as const;
export const SVC = { bath: "a6000000-0000-4000-a000-000000000001", trim: "a6000000-0000-4000-a000-000000000002", style: "a6000000-0000-4000-a000-000000000004", nail: "a6000000-0000-4000-a000-000000000006", north: "b6000000-0000-4000-a000-000000000001" } as const;
export const PET = { coco: "a8000000-0000-4000-a000-000000000001", naicha: "a8000000-0000-4000-a000-000000000002", lucky: "a8000000-0000-4000-a000-000000000003", toast: "a8000000-0000-4000-a000-000000000006", north: "b8000000-0000-4000-a000-000000000001" } as const;
export const APT = { lucky: "a9000000-0000-4000-a000-000000000001", coco: "a9000000-0000-4000-a000-000000000002", naicha: "a9000000-0000-4000-a000-000000000003", toast: "a9000000-0000-4000-a000-000000000004", request: "a9000000-0000-4000-a000-000000000005", north: "b9000000-0000-4000-a000-000000000001" } as const;

export function resetDb() {
  execFileSync("bash", ["scripts/db-reset-local.sh"], { env: { ...process.env, DATABASE_URL }, stdio: "pipe" });
}

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 12 });

type Who = { user: string } | "anon";

/** Runs `fn` in a transaction as a Supabase API caller would: role authenticated/anon + JWT claims. */
export async function as<T>(who: Who, fn: (c: pg.PoolClient) => Promise<T>, opts: { commit?: boolean } = {}): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (who === "anon") {
      await c.query("set local role anon");
    } else {
      const claims = JSON.stringify({ sub: who.user, role: "authenticated" });
      await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [who.user, claims]);
      await c.query("set local role authenticated");
    }
    const out = await fn(c);
    await c.query(opts.commit === false ? "rollback" : "commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export const user = (id: string) => ({ user: id });

/** Extracts the machine code (hint) from an app.fail() error. */
export async function failsWith(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { hint?: string; code?: string; message: string };
    // app.fail() puts a machine code in `hint`; Postgres' own errors carry a SQLSTATE in `code`.
    return err.hint && /^[A-Z_]+$/.test(err.hint) ? err.hint : err.code || err.message;
  }
  throw new Error("expected failure, but it succeeded");
}

export async function rpc<T = Record<string, unknown>>(c: pg.PoolClient, fn: string, args: unknown[]): Promise<T> {
  const ph = args.map((_, i) => `$${i + 1}`).join(", ");
  const r = await c.query(`select * from app.${fn}(${ph})`, args);
  return r.rows[0] as T;
}

export async function version(id: string): Promise<number> {
  const r = await pool.query("select version from public.appointments where id = $1", [id]);
  return r.rows[0].version;
}

/** Today in Asia/Taipei at HH:MM, as ISO (seed appointments are relative to today). */
export async function todayAt(hm: string, plusDays = 0): Promise<string> {
  const r = await pool.query(`select ((((now() at time zone 'Asia/Taipei')::date + $2::int) + $1::time) at time zone 'Asia/Taipei') as t`, [hm, plusDays]);
  return (r.rows[0].t as Date).toISOString();
}

/** Day offset (from today, Asia/Taipei) of the n-th upcoming open weekday (Monday is 店休 in the seed). */
export async function nextOpenDay(n = 1): Promise<number> {
  const r = await pool.query(`select o from generate_series(1, 21) o where extract(dow from (now() at time zone 'Asia/Taipei')::date + o) <> 1 order by o`);
  return r.rows[n - 1].o;
}
