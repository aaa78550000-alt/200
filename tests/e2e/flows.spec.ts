import { expect, test, type Page } from "@playwright/test";
import { setDemo, setRole, settle, shotPath, watchConsole } from "./helpers";

// Interaction flows on DEMO data, mapped to docs/QA_ACCEPTANCE.md E-numbers.
// Each test runs in a fresh browser context → fresh fixtures.

const detail = (page: Page) => page.getByTestId("appointment-detail");

async function openDetail(page: Page, id: string) {
  await page.goto(`/app/appointments/${id}`);
  await expect(detail(page)).toBeVisible();
}

test.describe("staff workflow", () => {
  test("E08/E09/E10: finish → ready_pickup → paid but still here → handover → completed; Today stays in sync", async ({ page }, info) => {
    const errors = watchConsole(page);
    await page.goto("/app/today");
    await expect(page.getByRole("tab", { name: /服務中\s*1/ })).toBeVisible();
    await page.getByTestId("quick-finish-apt-coco-today").click();
    await expect(page.getByTestId("finish-review")).toBeVisible();
    // finish_review is a draft: status still in_service until commit
    await expect(detail(page)).toHaveAttribute("data-status", "in_service");
    await page.getByTestId("commit-finish").click();
    await expect(detail(page)).toHaveAttribute("data-status", "ready_pickup");
    // un-approved add-on (nail trim) is not billed
    await expect(page.getByTestId("owing")).toHaveText("NT$900");
    // mock LINE worker sends independently
    await expect(page.getByTestId("notification-status")).toContainText("已送出");
    await expect(page.getByTestId("notification-status")).not.toContainText("已讀");

    await page.getByTestId("open-payment").click();
    await page.getByTestId("submit-payment").click();
    await expect(page.getByTestId("payment-status")).toContainText("已付清");
    await expect(detail(page)).toHaveAttribute("data-status", "ready_pickup"); // E09
    await page.screenshot({ path: shotPath(info, "flow-paid-awaiting-pickup"), fullPage: true });

    await page.getByTestId("handover").click();
    await expect(detail(page)).toHaveAttribute("data-status", "completed"); // E10
    await expect(page.getByText("飼主已接回，預約完成")).toBeVisible();

    await page.goto("/app/today");
    await expect(page.getByRole("tab", { name: /服務中\s*0/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /待接回\s*1/ })).toBeVisible(); // Lucky still waiting
    expect(errors).toEqual([]);
  });

  test("abnormal finish requires incident note and owner-contact state", async ({ page }) => {
    await openDetail(page, "apt-coco-today");
    await page.getByTestId("open-finish-review").click();
    await page.getByText("有異常狀況").click();
    await page.getByTestId("commit-finish").click();
    await expect(page.getByText("請描述觀察到的狀況與處理方式")).toBeVisible();
    await expect(detail(page)).toHaveAttribute("data-status", "in_service");
    await page.getByLabel("異常狀況說明").fill("右耳內側發現紅點，已停止清耳並拍照");
    await page.getByText("已聯絡飼主").click();
    await page.getByTestId("commit-finish").click();
    await expect(detail(page)).toHaveAttribute("data-status", "ready_pickup");
    await expect(page.getByText(/異常紀錄：右耳內側/)).toBeVisible();
  });

  test("add-on needs owner approval before it is billable", async ({ page }) => {
    await openDetail(page, "apt-coco-today");
    await expect(page.getByTestId("addon-section").getByText("等待飼主同意")).toBeVisible();
    await page.getByRole("button", { name: "飼主同意", exact: true }).click();
    await expect(page.getByText("飼主已同意")).toBeVisible();
    await page.getByTestId("open-finish-review").click();
    await page.getByTestId("commit-finish").click();
    await expect(page.getByTestId("owing")).toHaveText("NT$1,000");
  });

  test("E11: partial payment then refund, ledger kept", async ({ page }) => {
    await openDetail(page, "apt-lucky");
    await page.getByTestId("open-payment").click();
    await page.getByLabel("金額（NT$）").fill("300");
    await page.getByTestId("submit-payment").click();
    await expect(page.getByTestId("payment-status")).toContainText("部分付款");
    await expect(page.getByTestId("owing")).toHaveText("NT$350");
    await page.getByTestId("open-payment").click();
    await page.getByText("轉帳", { exact: true }).click();
    await page.getByTestId("submit-payment").click();
    await expect(page.getByTestId("payment-status")).toContainText("已付清");
    await page.getByTestId("open-refund").click();
    await page.getByLabel("金額（NT$）").fill("100");
    await page.getByTestId("submit-payment").click();
    await expect(page.getByText("請填寫退款原因")).toBeVisible();
    await page.getByLabel("退款原因").fill("梳毛時間縮短，店家折讓");
    await page.getByTestId("submit-payment").click();
    await expect(page.getByTestId("payment-status")).toContainText("部分退款");
    await expect(page.getByRole("list", { name: "收款紀錄" }).getByRole("listitem")).toHaveCount(3);
  });

  test("unpaid handover: receptionist is refused, owner can authorize with a reason (logged)", async ({ page }) => {
    await page.goto("/app/today");
    await setRole(page, "櫃檯");
    await openDetail(page, "apt-lucky");
    await page.getByTestId("unpaid-handover").click();
    await page.getByLabel("未付款交接原因").fill("熟客月結");
    await page.getByRole("button", { name: "授權並交接" }).click();
    await expect(page.getByText(/未付款交接需店長授權/)).toBeVisible();
    await expect(detail(page)).toHaveAttribute("data-status", "ready_pickup");

    await setRole(page, "店主");
    await openDetail(page, "apt-lucky");
    await page.getByTestId("unpaid-handover").click();
    await page.getByLabel("未付款交接原因").fill("熟客月結");
    await page.getByRole("button", { name: "授權並交接" }).click();
    await expect(detail(page)).toHaveAttribute("data-status", "completed");
    await expect(page.getByText(/授權未付款交接（未收 NT\$650）：熟客月結/)).toBeVisible();
  });

  test("groomer role cannot see money", async ({ page }) => {
    await page.goto("/app/today");
    await setRole(page, "美容師");
    await openDetail(page, "apt-lucky");
    await expect(page.getByTestId("payment-status")).toHaveCount(0);
    await expect(page.getByTestId("open-payment")).toHaveCount(0);
  });

  test("E17: offline — actions fail visibly, nothing pretends to succeed", async ({ page }) => {
    await openDetail(page, "apt-naicha");
    await setDemo(page, "demo-offline");
    await page.getByRole("button", { name: "報到" }).click();
    await expect(page.getByText("未送出：目前離線")).toBeVisible();
    await setDemo(page, "demo-offline", false);
    await openDetail(page, "apt-naicha");
    await expect(detail(page)).toHaveAttribute("data-status", "confirmed");
  });

  test("E14: LINE failure does not roll back the finish; retry is available", async ({ page }) => {
    await openDetail(page, "apt-coco-today");
    await setDemo(page, "demo-line-fails");
    await page.getByTestId("open-finish-review").click();
    await page.getByTestId("commit-finish").click();
    await expect(detail(page)).toHaveAttribute("data-status", "ready_pickup");
    await expect(page.getByTestId("notification-status")).toContainText("送出失敗");
    await setDemo(page, "demo-line-fails", false);
    await page.getByRole("button", { name: "重試" }).click();
    await expect(page.getByTestId("notification-status")).toContainText("已送出");
  });
});

test.describe("scheduling", () => {
  test("E04: returning pet booked by staff from its profile; conflict is shown before submit", async ({ page }) => {
    await page.goto("/app/pets/pet-coco");
    await page.getByRole("button", { name: /新增預約/ }).last().click();
    const form = page.getByTestId("new-appointment-form");
    await expect(form.getByText("Coco", { exact: false }).first()).toBeVisible();
    await form.getByText("基礎洗澡").click();
    await form.getByRole("radiogroup", { name: "美容師" }).getByText("Amy").click();
    await form.getByLabel("開始時間").selectOption("16:00");
    await expect(page.getByTestId("conflict-hint")).toContainText("重疊");
    await form.getByLabel("日期").fill("2026-10-29");
    await form.getByLabel("開始時間").selectOption("10:00");
    await expect(page.getByTestId("conflict-hint")).toHaveCount(0);
    await page.getByTestId("create-appointment").click();
    await expect(detail(page)).toHaveAttribute("data-status", "confirmed");
    await expect(page.getByText("建立並確認預約")).toBeVisible();
  });

  test("E03: same-name pets are distinguishable in search", async ({ page }) => {
    await page.goto("/app/pets");
    await page.getByTestId("pet-search").fill("coco");
    const results = page.getByTestId("pet-results").getByRole("listitem");
    await expect(results).toHaveCount(2);
    await expect(results.nth(0)).toContainText("同名");
    await expect(page.getByTestId("pet-results")).toContainText("林小姐");
    await expect(page.getByTestId("pet-results")).toContainText("陳先生");
    await expect(page.getByTestId("pet-results")).toContainText("瑪爾濟斯");
    await page.getByTestId("pet-search").fill("0928");
    await expect(results).toHaveCount(2); // phone search → both of 陳先生's pets
  });

  test("E06: confirming a request onto a groomer's day off is blocked; another groomer works", async ({ page }) => {
    await openDetail(page, "apt-req-lucky");
    await expect(page.getByTestId("conflict-hint")).toContainText("休假");
    await page.getByTestId("confirm-request").click();
    await expect(page.getByText("這個時段無法安排")).toBeVisible();
    await expect(detail(page)).toHaveAttribute("data-status", "pending");
    await page.getByRole("radiogroup", { name: "指派美容師" }).getByText("May").click();
    await page.getByTestId("confirm-request").click();
    await expect(detail(page)).toHaveAttribute("data-status", "confirmed");
  });

  test("E07: reschedule keeps the same id and writes history", async ({ page }) => {
    await openDetail(page, "apt-toast");
    await page.getByRole("button", { name: "改期" }).click();
    const form = page.getByTestId("reschedule-form");
    await form.getByLabel("日期").fill("2026-10-29");
    await form.getByLabel("開始時間").selectOption("16:00");
    await form.getByRole("button", { name: "確認改期" }).click();
    await expect(page).toHaveURL(/apt-toast/);
    await expect(page.getByText(/改期：2026-10-28 16:30 → 2026-10-29 16:00/)).toBeVisible();
  });

  test("E05 (UI): another device confirms the same slot first → second confirm fails", async ({ page }) => {
    await openDetail(page, "apt-req-coco2");
    await page.getByRole("radiogroup", { name: "指派美容師" }).getByText("May").click();
    await setDemo(page, "demo-slot-race");
    await page.getByTestId("confirm-request").click();
    await expect(page.getByText("這個時段無法安排")).toBeVisible();
    await expect(detail(page)).toHaveAttribute("data-status", "pending");
  });

  test("calendar: click empty slot pre-fills groomer + time (desktop)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop timeline");
    await page.goto("/app/calendar?date=2026-10-29");
    await page.getByRole("button", { name: "新增 May 10/29 11:00 的預約" }).click();
    const form = page.getByTestId("new-appointment-form");
    await expect(form.getByLabel("開始時間")).toHaveValue("11:00");
    await expect(form.getByRole("radiogroup", { name: "美容師" }).getByRole("radio", { name: "May" })).toBeChecked();
    await settle(page);
    await page.screenshot({ path: shotPath(info, "flow-calendar-new") });
  });
});

test.describe("owner online booking", () => {
  test("E16: four steps as a new customer → pending (never 'success'); shows up for staff", async ({ page }, info) => {
    const errors = watchConsole(page);
    await page.goto("/book/calm-studio");
    const next = page.getByTestId("booking-next");
    const isMobile = info.project.name === "mobile";
    const go = async () => (isMobile ? next.click() : page.getByRole("button", { name: /下一步|送出預約申請/ }).last().click());
    if (isMobile) await expect(next).toBeDisabled();
    await page.getByText("基礎洗澡", { exact: true }).click();
    await go();
    await page.getByRole("tab", { name: /29/ }).click();
    await page.getByRole("radio", { name: "14:00" }).click();
    await go();
    await page.getByLabel("怎麼稱呼你").fill("測試小姐");
    await page.getByLabel("手機號碼").fill("0900-123-456");
    await page.getByLabel("毛孩名字").fill("湯圓");
    await go();
    await expect(page.getByText("預約須知", { exact: true })).toBeVisible();
    if (isMobile) await expect(next).toBeDisabled();
    await page.getByTestId("agree").check();
    await settle(page);
    await page.screenshot({ path: shotPath(info, "flow-booking-confirm") });
    await go();
    await expect(page.getByTestId("booking-result")).toBeVisible();
    await expect(page.getByRole("heading", { name: "已收到申請，等待店家確認" })).toBeVisible();
    await expect(page.getByText("預約成功")).toHaveCount(0);
    await settle(page);
    await page.screenshot({ path: shotPath(info, "flow-booking-result") });

    await page.goto("/app/today");
    await expect(page.locator("#requests").locator("..")).toContainText("湯圓");
    expect(errors).toEqual([]);
  });

  test("E18: returning customer must verify the phone; wrong code reveals nothing", async ({ page }) => {
    await page.goto("/book/calm-studio");
    await page.getByText("洗澡＋修剪", { exact: true }).click();
    await page.getByRole("button", { name: /下一步/ }).last().click();
    await page.getByRole("tab", { name: /29/ }).click();
    await page.getByRole("radio", { name: "15:00" }).click();
    await page.getByRole("button", { name: /下一步/ }).last().click();
    await page.getByText("我來過（手機驗證）").click();
    await expect(page.getByText("Coco")).toHaveCount(0);
    await page.getByLabel("手機號碼").fill("0912-000-101");
    await page.getByRole("button", { name: "傳送驗證碼" }).click();
    await page.getByLabel("驗證碼").fill("000000");
    await page.getByRole("button", { name: "驗證" }).click();
    await expect(page.getByText("驗證碼不正確")).toBeVisible();
    await expect(page.getByText("Coco")).toHaveCount(0);
    await page.getByLabel("驗證碼").fill("123456");
    await page.getByRole("button", { name: "驗證" }).click();
    await expect(page.getByText("林小姐 你好")).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "選擇毛孩" })).toContainText("Coco");
  });

  test("slot taken at submit: back to step 2, draft kept, no fake success", async ({ page }) => {
    await page.goto("/book/calm-studio");
    await page.getByText("基礎洗澡", { exact: true }).click();
    await page.getByRole("button", { name: /下一步/ }).last().click();
    await page.getByRole("tab", { name: /29/ }).click();
    await page.getByRole("radio", { name: "16:00" }).click();
    await page.getByRole("button", { name: /下一步/ }).last().click();
    await page.getByLabel("怎麼稱呼你").fill("測試先生");
    await page.getByLabel("手機號碼").fill("0900-222-333");
    await page.getByLabel("毛孩名字").fill("黑糖");
    await page.getByRole("button", { name: /下一步/ }).last().click();
    await setDemo(page, "demo-slot-race");
    await page.getByTestId("agree").check();
    await page.getByRole("button", { name: /送出預約申請/ }).last().click();
    await expect(page.getByTestId("slot-taken")).toBeVisible();
    await expect(page.getByTestId("booking-result")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "16:00" })).toHaveCount(0); // that slot is gone now
    await page.getByRole("radio", { name: "17:30" }).click();
    await page.getByRole("button", { name: /下一步/ }).last().click();
    await expect(page.getByLabel("毛孩名字")).toHaveValue("黑糖");
  });
});
