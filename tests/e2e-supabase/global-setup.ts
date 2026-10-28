import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const WORKER_SECRET = "local-test-worker-secret-0123456789abcdef";

export default function globalSetup() {
  const db = process.env.SUPABASE_DB_URL!;
  // Fresh schema + seed on the LOCAL Supabase database before the suite.
  execFileSync("bash", ["scripts/db-reset-local.sh"], { env: { ...process.env, DATABASE_URL: db }, stdio: "inherit" });
  // Same wiring the deploy workflow does in production: where pg_net should call the notify worker, and the
  // dedicated worker secret (also given to the Edge Functions via supabase/functions/.env).
  const sql = `
    delete from vault.secrets where name in ('petos_worker_url', 'petos_worker_key');
    select vault.create_secret('http://supabase_kong_petos:8000/functions/v1/notify-worker', 'petos_worker_url');
    select vault.create_secret('${WORKER_SECRET}', 'petos_worker_key');`;
  execFileSync("psql", [db, "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "inherit" });
  // Edge Functions reach the stand-in LINE API on the host (zz-line-and-staff.spec.ts). The edge runtime reads
  // this file when `supabase start` launches it, so a first run after changing it needs a restart.
  writeFileSync("supabase/functions/.env", `LINE_API_BASE=http://host.docker.internal:5299\nPETOS_WORKER_SECRET=${WORKER_SECRET}\n`);
}
