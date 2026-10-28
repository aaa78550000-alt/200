import { execFileSync } from "node:child_process";

export default function globalSetup() {
  // Fresh schema + seed on the LOCAL Supabase database before the suite.
  execFileSync("bash", ["scripts/db-reset-local.sh"], { env: { ...process.env, DATABASE_URL: process.env.SUPABASE_DB_URL! }, stdio: "inherit" });
}
