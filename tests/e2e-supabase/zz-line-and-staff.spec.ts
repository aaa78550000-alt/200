import { expect, test, type Page } from "@playwright/test";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";

// Real LINE delivery and staff accounts, end to end through the UI, Edge Functions and pg_net.
// The only stand-in is the LINE API itself: a local HTTP server that records what LINE would receive
// (Edge Functions reach it through LINE_API_BASE). Runs after real-backend.spec.ts (file name order).
const SHOP = "a0000000-0000-4000-a000-00000000000a";
const SECRET = "0123456789abcdef0123456789abcdef";
const TOKEN = "LINE-TEST-TOKEN-" + "x".repeat(48);
const COCO_PET = "a8000000-0000-4000-a000-000000000001";

type Call = { path: string; auth?: string; retry?: string; body: { to?: string; replyToken?: string; messages: { text: string }[] } };
const calls: Call[] = [];
let server: http.Server;
let db: pg.Client;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  server = http
    .createServer((req, res) => {
      let b = "";
      req.on("data", (d) => (b += d));
      req.on("end", () => {
        calls.push({ path: req.url ?? "", auth: req.headers.authorization, retry: req.headers["x-line-retry-key"] as string, body: JSON.parse(b || "{}") });
        res.writeHead(200, { "content-type": "application/json" }).end("{}");
      });
    })
    .listen(5299, "0.0.0.0");
  db = new pg.Client(process.env.SUPABASE_DB_URL);
  await db.connect();
  // these tests exercise the production path, not the local demo helpers
  await db.query("update shops set dev_mode = false where id = $1", [SHOP]);
});

test.afterAll(async () => {
  await db.query("delete from shop_line_channels where shop_id = $1", [SHOP]);
  await db.query("update shops set dev_mode = true where id = $1", [SHOP]);
  await db.end();
  server.close();
});

async function login(page: Page, email: string, password = "petos-dev-only") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.getByRole("heading", { name: "今日工作" })).toBeVisible();
}

/** A fresh in-service appointment for 林小姐's Coco with May (the earlier suite already completed the seeded one). */
async function freshInService(offsetMin: number): Promise<string> {
  const r = await db.query(
    `insert into appointments (shop_id, pet_id, customer_id, staff_id, starts_at, ends_at, buffer_minutes, status, version, source)
     values ($1, $2, 'a7000000-0000-4000-a000-000000000001', 'a5000000-0000-4000-a000-000000000003',
       now() + make_interval(mins => $3), now() + make_interval(mins => $3 + 50), 0, 'in_service', 1, 'staff') returning id`,
    [SHOP, COCO_PET, offsetMin],
  );
  await db.query("insert into appointment_items (shop_id, appointment_id, service_id, name, price_snapshot, duration_snapshot) values ($1, $2, 'a6000000-0000-4000-a000-000000000001', '基礎洗澡', 700, 60)", [SHOP, r.rows[0].id]);
  return r.rows[0].id;
}

async function waitForCall(pred: (c: Call) => boolean) {
  await expect.poll(() => calls.some(pred), { timeout: 20_000 }).toBe(true);
  return calls.find(pred)!;
}

async function sendWebhook(events: unknown[], secret = SECRET) {
  const body = JSON.stringify({ events });
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64");
  return fetch(`${process.env.SUPABASE_API_URL}/functions/v1/line-webhook?shop=${SHOP}`, { method: "POST", headers: { "x-line-signature": sig, "content-type": "application/json" }, body });
}

test("without LINE: a finished grooming says 未發送 with the reason (no fake success)", async ({ page }) => {
  await login(page, "amy@calm.petos.test");
  await page.goto(`/app/appointments/${await freshInService(-2000)}`);
  await page.getByTestId("open-finish-review").click();
  await page.getByTestId("commit-finish").click();
  await expect(page.getByTestId("notification-status")).toContainText("未發送");
  await expect(page.getByTestId("notification-status")).toContainText("店家尚未連接 LINE 官方帳號");
  expect(calls).toHaveLength(0);
});

test("owner connects the shop's LINE account in settings", async ({ page }) => {
  await login(page, "owner@calm.petos.test");
  await page.goto("/app/more");
  await expect(page.getByTestId("line-status")).toContainText("尚未連接");
  await page.getByTestId("edit-line").click();
  await page.getByLabel("LINE ID（例如 @123abcde）").fill("@petostest");
  await page.getByLabel("Channel secret").fill(SECRET);
  await page.getByLabel("Channel access token（long-lived）").fill(TOKEN);
  await page.getByRole("button", { name: "儲存並連接" }).click();
  await expect(page.getByTestId("line-status")).toContainText("已連接 @petostest");
  await expect(page.getByText(`/functions/v1/line-webhook?shop=${SHOP}`)).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/supabase-line-settings.png", fullPage: true });
});

test("LINE verify request and a forged signature", async () => {
  expect((await sendWebhook([])).status).toBe(200); // LINE console "Verify" button
  expect((await sendWebhook([], "wrong-secret-wrong-secret-123456")).status).toBe(401);
});

test("staff gives a link code → customer sends it on LINE → linked", async ({ page }) => {
  await login(page, "iris@calm.petos.test");
  await page.goto(`/app/pets/${COCO_PET}`);
  await page.getByRole("tab", { name: "會員" }).click();
  await page.getByTestId("make-link-code").click();
  const code = (await page.getByTestId("link-code").locator("p.num").textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);

  expect((await sendWebhook([{ type: "message", replyToken: "r1", source: { userId: "U-lin-001" }, message: { type: "text", text: code } }])).status).toBe(200);
  const reply = await waitForCall((c) => c.path.endsWith("/reply") && c.body.replyToken === "r1");
  expect(reply.body.messages[0].text).toContain("綁定完成");
  await page.reload();
  await page.getByRole("tab", { name: "會員" }).click();
  await expect(page.getByTestId("line-link-state")).toContainText("已綁定");

});

test("returning customer verifies with a code delivered to their LINE", async ({ page }) => {
  await page.goto("/book/calm-studio");
  await page.getByText("洗澡＋修剪", { exact: true }).click();
  await page.getByRole("button", { name: "下一步" }).last().click();
  await page.getByRole("tab").filter({ hasNotText: "今天" }).filter({ hasNotText: "店休" }).nth(2).click();
  await page.getByTestId("slot-list").getByRole("radio").first().click();
  await page.getByRole("button", { name: "下一步" }).last().click();
  await page.getByText("我來過（LINE 驗證）").click();
  await page.getByLabel("手機號碼").fill("0912-000-101");
  await page.getByRole("button", { name: "傳送驗證碼" }).click();
  await expect(page.getByText("驗證碼已傳到你的 LINE")).toBeVisible();
  const push = await waitForCall((c) => c.path.endsWith("/push") && c.body.to === "U-lin-001" && c.body.messages[0].text.includes("驗證碼"));
  expect(push.auth).toBe(`Bearer ${TOKEN}`);
  const code = push.body.messages[0].text.match(/(\d{6})/)![1];
  await page.getByLabel("驗證碼").fill(code);
  await page.getByRole("button", { name: "驗證" }).click();
  await expect(page.getByRole("radiogroup", { name: "選擇毛孩" })).toContainText("Coco");
  // the code was wiped from the queue after sending
  const left = await db.query("select count(*)::int n from notification_jobs where kind = 'otp' and payload is not null");
  expect(left.rows[0].n).toBe(0);
});

test("ready-for-pickup is pushed to the linked customer with the shop's token", async ({ page }) => {
  await login(page, "iris@calm.petos.test");
  const id = await freshInService(-1000);
  await page.goto(`/app/appointments/${id}`);
  await page.getByTestId("open-finish-review").click();
  await page.getByTestId("commit-finish").click();
  const push = await waitForCall((c) => c.path.endsWith("/push") && c.body.messages[0].text.includes("已完成美容"));
  expect(push.body.to).toBe("U-lin-001");
  expect(push.retry).toBeTruthy(); // idempotent retries
  await expect(page.getByTestId("notification-status")).toContainText("已送出", { timeout: 15_000 });
  await page.screenshot({ path: "artifacts/screenshots/supabase-line-sent.png", fullPage: true });
});

test("online request shows the LINE link code to the customer", async ({ page }) => {
  await page.goto("/book/calm-studio");
  await page.getByText("基礎洗澡", { exact: true }).click();
  await page.getByRole("button", { name: "下一步" }).last().click();
  await page.getByRole("tab").filter({ hasNotText: "今天" }).filter({ hasNotText: "店休" }).nth(3).click();
  await page.getByTestId("slot-list").getByRole("radio").first().click();
  await page.getByRole("button", { name: "下一步" }).last().click();
  await page.getByLabel("怎麼稱呼你").fill("新客人");
  await page.getByLabel("手機號碼").fill("0900-456-789");
  await page.getByLabel("毛孩名字").fill("小米");
  await page.getByRole("button", { name: "下一步" }).last().click();
  await page.getByTestId("agree").check();
  await page.getByRole("button", { name: "送出預約申請" }).last().click();
  await expect(page.getByTestId("booking-line-code")).toContainText("@petostest");
  await page.screenshot({ path: "artifacts/screenshots/supabase-booking-line-code.png", fullPage: true });
});

test("owner creates a staff account; the new staff logs in; disabled staff is locked out", async ({ page }) => {
  const email = `staff-${Date.now()}@calm.petos.test`;
  await login(page, "owner@calm.petos.test");
  await page.goto("/app/more");
  await page.getByTestId("new-staff").click();
  await page.getByLabel("稱呼").fill("小新");
  await page.getByLabel("登入 Email").fill(email);
  await page.getByLabel("初始密碼").fill("first-pass-123");
  await page.getByTestId("create-staff").click();
  await expect(page.getByTestId("staff-accounts")).toContainText(email);
  await page.screenshot({ path: "artifacts/screenshots/supabase-staff-accounts.png", fullPage: true });

  const ctx2 = await page.context().browser()!.newContext();
  const staffPage = await ctx2.newPage();
  await login(staffPage, email, "first-pass-123");
  await expect(staffPage.getByText("小新 · 美容師")).toBeVisible();

  const row = page.getByTestId("staff-accounts").locator("li", { hasText: email });
  await row.getByRole("button", { name: "停用" }).click();
  await expect(row).toContainText("已停用");
  await staffPage.reload();
  await expect(staffPage.getByText("這個帳號已被店家停用")).toBeVisible();
  await ctx2.close();
});
