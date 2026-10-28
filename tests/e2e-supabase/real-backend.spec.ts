import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// UI against the real local Supabase: data must survive a reload, and the backend decides.
const COCO_APT = "a9000000-0000-4000-a000-000000000002";
const LUCKY_APT = "a9000000-0000-4000-a000-000000000001";
const NAICHA_APT = "a9000000-0000-4000-a000-000000000003";
const shot = (name: string) => `artifacts/screenshots/supabase-${name}.png`;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("密碼").fill("petos-dev-only");
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.getByRole("heading", { name: "今日工作" })).toBeVisible();
}
const detail = (page: Page) => page.getByTestId("appointment-detail");

test("unauthenticated staff pages redirect to login", async ({ page }) => {
  await page.goto("/app/today");
  await expect(page).toHaveURL(/\/login$/);
});

test("M3: finish → ready_pickup → pay → reload keeps state → handover (persisted, mock LINE sent)", async ({ page }) => {
  await login(page, "iris@calm.petos.test");
  await expect(page.getByTestId(`apt-row-${COCO_APT}`)).toContainText("服務中");
  await page.screenshot({ path: shot("today-desktop") });
  await page.goto(`/app/appointments/${COCO_APT}`);
  await page.getByTestId("open-finish-review").click();
  await page.getByTestId("commit-finish").click();
  await expect(detail(page)).toHaveAttribute("data-status", "ready_pickup");
  await page.reload();
  await expect(detail(page)).toHaveAttribute("data-status", "ready_pickup");
  await expect(page.getByTestId("owing")).toHaveText("NT$900"); // pending add-on not billed
  await expect(page.getByTestId("notification-status")).toContainText("已送出", { timeout: 15_000 });

  await page.getByTestId("open-payment").click();
  await page.getByLabel("金額（NT$）").fill("500");
  await page.getByTestId("submit-payment").click();
  await expect(page.getByTestId("payment-status")).toContainText("部分付款");
  await page.reload();
  await expect(page.getByTestId("payment-status")).toContainText("部分付款");
  await page.getByTestId("open-payment").click();
  await page.getByTestId("submit-payment").click();
  await expect(page.getByTestId("payment-status")).toContainText("已付清");
  await page.getByTestId("handover").click();
  await expect(detail(page)).toHaveAttribute("data-status", "completed");
  await page.reload();
  await expect(detail(page)).toHaveAttribute("data-status", "completed");
  await expect(page.getByText("飼主已接回，預約完成")).toBeVisible();
  await page.screenshot({ path: shot("completed-detail"), fullPage: true });
});

test("receptionist cannot authorize an unpaid handover (server refuses)", async ({ page }) => {
  await login(page, "iris@calm.petos.test");
  await page.goto(`/app/appointments/${LUCKY_APT}`);
  await page.getByTestId("unpaid-handover").click();
  await page.getByLabel("未付款交接原因").fill("熟客月結");
  await page.getByRole("button", { name: "授權並交接" }).click();
  await expect(page.getByText(/未付款交接需店長授權/)).toBeVisible();
  await page.reload();
  await expect(detail(page)).toHaveAttribute("data-status", "ready_pickup");
});

test("groomer sees care notes but no money", async ({ page }) => {
  await login(page, "amy@calm.petos.test");
  await page.goto(`/app/appointments/${LUCKY_APT}`);
  await expect(page.getByText("左後腿舊傷", { exact: false })).toBeVisible();
  await expect(page.getByTestId("payment-status")).toHaveCount(0);
  await expect(page.getByTestId("open-payment")).toHaveCount(0);
});

test("E15: another shop's owner cannot open this shop's appointment or pets", async ({ page }) => {
  await login(page, "owner@north.petos.test");
  await page.goto(`/app/appointments/${COCO_APT}`);
  await expect(page.getByText("找不到這筆預約")).toBeVisible();
  await page.goto("/app/pets");
  await page.getByTestId("pet-search").fill("Coco");
  await expect(page.getByText("找不到「Coco」")).toBeVisible();
});

test("E16 + confirm: anonymous request is pending; staff confirms it with capacity check", async ({ page, browser }) => {
  const customer = await browser.newPage();
  await customer.goto("/book/calm-studio");
  await customer.getByText("基礎洗澡", { exact: true }).click();
  await customer.getByRole("button", { name: "下一步" }).last().click();
  // pick the first open day after today, first slot
  await customer.getByRole("tab").filter({ hasNotText: "今天" }).filter({ hasNotText: "店休" }).first().click();
  await customer.getByTestId("slot-list").getByRole("radio").first().click();
  await customer.getByRole("button", { name: "下一步" }).last().click();
  await customer.getByLabel("怎麼稱呼你").fill("測試小姐");
  await customer.getByLabel("手機號碼").fill("0900-123-456");
  await customer.getByLabel("毛孩名字").fill("湯圓");
  await customer.getByRole("button", { name: "下一步" }).last().click();
  await customer.getByTestId("agree").check();
  await customer.getByRole("button", { name: "送出預約申請" }).last().click();
  await expect(customer.getByRole("heading", { name: "已收到申請，等待店家確認" })).toBeVisible();
  await customer.close();

  await login(page, "iris@calm.petos.test");
  const req = page.locator("li", { hasText: "湯圓" });
  await expect(req).toBeVisible();
  await req.getByRole("button").first().click();
  await page.getByRole("radiogroup", { name: "指派美容師" }).getByText("May").click();
  await page.getByTestId("confirm-request").click();
  await expect(detail(page)).toHaveAttribute("data-status", "confirmed");
});

test("returning customer: OTP (dev echo) then only their own pets", async ({ page }) => {
  await page.goto("/book/calm-studio");
  await page.getByText("洗澡＋修剪", { exact: true }).click();
  await page.getByRole("button", { name: "下一步" }).last().click();
  await page.getByRole("tab").filter({ hasNotText: "今天" }).filter({ hasNotText: "店休" }).first().click();
  await page.getByTestId("slot-list").getByRole("radio").first().click();
  await page.getByRole("button", { name: "下一步" }).last().click();
  await page.getByText("我來過（手機驗證）").click();
  await page.getByLabel("手機號碼").fill("0928-000-202");
  await page.getByRole("button", { name: "傳送驗證碼" }).click();
  await page.getByLabel("驗證碼").fill("000000");
  await page.getByRole("button", { name: "驗證" }).click();
  await expect(page.getByText("驗證碼不正確")).toBeVisible();
  await page.getByLabel("驗證碼").fill("123456");
  await page.getByRole("button", { name: "驗證" }).click();
  const pets = page.getByRole("radiogroup", { name: "選擇毛孩" });
  await expect(pets).toContainText("布丁");
  await expect(pets).toContainText("Coco");
  await expect(pets).not.toContainText("Lucky");
});

test("E02: photo upload goes to private storage and is shown via a signed URL", async ({ page }) => {
  await login(page, "owner@calm.petos.test");
  await page.goto("/app/pets/a8000000-0000-4000-a000-000000000001");
  await page.getByRole("tab", { name: "相簿" }).click();
  await page.getByTestId("photo-input").setInputFiles(path.resolve("public/demo/pets/coco-poodle.jpg"));
  await expect(page.getByText("照片已上傳")).toBeVisible();
  const img = page.locator('img[alt="Coco 美容後照片"]').first();
  await expect(img).toBeVisible();
  expect(await img.getAttribute("src")).toMatch(/\/storage\/v1\/object\/sign\/pet-media\//);
  await page.reload();
  await page.getByRole("tab", { name: "相簿" }).click();
  await expect(page.locator('img[alt="Coco 美容後照片"]').first()).toBeVisible();
});

test("E02: weight and care note persist with server-side provenance", async ({ page }) => {
  await login(page, "amy@calm.petos.test");
  await page.goto("/app/pets/a8000000-0000-4000-a000-000000000002");
  await page.getByRole("button", { name: "編輯" }).first().click();
  await page.getByRole("menuitem", { name: "記錄體重" }).click();
  await page.getByLabel("體重（kg）").fill("10.4");
  await page.getByRole("button", { name: "儲存" }).click();
  await page.reload();
  await expect(page.getByText("10.4").first()).toBeVisible();
  await page.getByRole("tab", { name: "照護資訊" }).click();
  await expect(page.getByTestId("weight-history")).toContainText("Amy");
});

test("E17: network failure never shows a fake success", async ({ page, context }) => {
  await login(page, "iris@calm.petos.test");
  await page.goto(`/app/appointments/${NAICHA_APT}`);
  await expect(detail(page)).toHaveAttribute("data-status", "confirmed");
  await context.setOffline(true);
  await page.getByRole("button", { name: "報到" }).click();
  await expect(page.getByText(/未送出|無法連線/).first()).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(detail(page)).toHaveAttribute("data-status", "confirmed");
});

test("E01: sign up → create shop → onboarding checklist → add first service and pet", async ({ page }) => {
  const stamp = Date.now().toString(36);
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`owner-${stamp}@petos.test`);
  await page.getByLabel("密碼").fill("petos-dev-only-123");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByLabel("店名").fill("E2E 新店");
  await page.getByLabel("飼主預約網址").fill(`e2e-${stamp}`);
  await page.getByLabel("你的稱呼").fill("新店主");
  await page.getByRole("button", { name: "建立店家" }).click();
  await expect(page.getByTestId("onboarding")).toBeVisible();
  await page.screenshot({ path: shot("onboarding"), fullPage: true });

  await page.getByTestId("new-service").click();
  await page.getByLabel("名稱").fill("小型犬洗澡");
  await page.getByLabel("價格（NT$）").fill("600");
  await page.getByTestId("save-service").click();
  await expect(page.locator("#services").locator("..").locator("li", { hasText: "小型犬洗澡" })).toContainText("NT$600");

  await page.goto("/app/pets");
  await page.getByTestId("new-pet").click();
  const form = page.getByTestId("new-pet-form");
  await form.getByLabel("飼主手機").fill("0912-000-101"); // same phone as a customer of ANOTHER shop
  await form.getByRole("button", { name: "查詢", exact: true }).click();
  await expect(form.getByLabel("飼主稱呼")).toBeVisible(); // not found here: shops never share customers
  await form.getByLabel("飼主稱呼").fill("第一位客人");
  await form.getByLabel("毛孩名字").fill("首隻");
  await page.getByTestId("create-pet").click();
  await expect(page.getByTestId("pet-name")).toHaveText("首隻");
});

test("E06 on real backend: leave lists affected bookings", async ({ page }) => {
  await login(page, "owner@calm.petos.test");
  await page.goto("/app/more");
  const form = page.getByTestId("time-off-form");
  await form.getByRole("radiogroup", { name: "休假美容師" }).getByText("Amy").click();
  const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date()));
  await form.getByLabel("日期").fill(today);
  await form.getByText("部分時段").click();
  await form.getByLabel("開始").selectOption("16:00");
  await form.getByLabel("結束").selectOption("19:00");
  await page.getByTestId("add-time-off").click();
  await expect(page.getByTestId("affected-appointments")).toContainText("吐司");
});
