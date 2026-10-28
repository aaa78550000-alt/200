import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

export default function globalSetup() {
  const db = process.env.SUPABASE_DB_URL!;
  // Fresh schema + seed on the LOCAL Supabase database before the suite.
  execFileSync("bash", ["scripts/db-reset-local.sh"], { env: { ...process.env, DATABASE_URL: db }, stdio: "inherit" });
  // Same wiring the deploy workflow does in production: where pg_net should call the notify worker.
  const sql = `
    delete from vault.secrets where name in ('petos_worker_url', 'petos_worker_key');
    select vault.create_secret('http://supabase_kong_petos:8000/functions/v1/notify-worker', 'petos_worker_url');
    select vault.create_secret('${process.env.SUPABASE_SERVICE_KEY}', 'petos_worker_key');`;
  execFileSync("psql", [db, "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "inherit" });
  // Edge Functions reach the stand-in LINE API on the host (tests/e2e-supabase/line.spec.ts).
  writeFileSync("supabase/functions/.env", "LINE_API_BASE=http://host.docker.internal:5299\n");
}
