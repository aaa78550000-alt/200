import { defineConfig } from "@playwright/test";

const PORT = 5174;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 6_000 },
  fullyParallel: true,
  workers: 3,
  reporter: [["list"], ["html", { open: "never", outputFolder: "artifacts/playwright-report" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/app/today`,
    reuseExistingServer: true,
    env: { VITE_DATA_MODE: "demo" },
  },
});
