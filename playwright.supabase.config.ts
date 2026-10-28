import { defineConfig } from "@playwright/test";
import { execSync } from "node:child_process";

// UI ⇄ real local Supabase (Auth + PostgREST + Storage). Requires `npx supabase start` (see README).
const PORT = 5175;
function localSupabase() {
  const out = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const s = JSON.parse(out.slice(out.indexOf("{")));
  return { url: s.API_URL as string, anon: s.ANON_KEY as string, db: s.DB_URL as string, service: s.SERVICE_ROLE_KEY as string };
}
const sb = localSupabase();
process.env.SUPABASE_DB_URL = sb.db;
process.env.SUPABASE_SERVICE_KEY = sb.service;
process.env.SUPABASE_API_URL = sb.url;

export default defineConfig({
  testDir: "tests/e2e-supabase",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e-supabase/global-setup.ts",
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: "zh-TW", timezoneId: "Asia/Taipei", viewport: { width: 1440, height: 900 }, trace: "retain-on-failure" },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    env: { VITE_DATA_MODE: "supabase", VITE_SUPABASE_URL: sb.url, VITE_SUPABASE_ANON_KEY: sb.anon },
  },
});
