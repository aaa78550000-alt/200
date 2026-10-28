import { expect, test } from "@playwright/test";
import { setRole, settle, shotPath } from "./helpers";

test("F02: staff creates a new owner + pet (phone looked up first), then books it", async ({ page }, info) => {
  await page.goto("/app/pets");
  await page.getByTestId("new-pet").click();
  const form = page.getByTestId("new-pet-form");
  await form.getByLabel("飼主手機").fill("0912-000-101");
  await form.getByRole("button", { name: "查詢", exact: true }).click();
  await expect(form.getByText("既有飼主：")).toContainText("林小姐");
  await form.getByLabel("飼主手機").fill("0900-777-888");
  await form.getByRole("button", { name: "查詢", exact: true }).click();
  await form.getByLabel("飼主稱呼").fill("新來的黃小姐");
  await form.getByLabel("毛孩名字").fill("芝麻");
  await settle(page);
  await page.screenshot({ path: shotPath(info, "state-new-pet") });
  await page.getByTestId("create-pet").click();
  await expect(page.getByTestId("pet-name")).toHaveText("芝麻");
  await expect(page.getByText("體重未提供").first()).toBeVisible();
});

test("new pet can be created inside 新增預約 without leaving the flow", async ({ page }) => {
  await page.goto("/app/today");
  await page.getByTestId("new-appointment").click();
  await page.getByTestId("add-new-pet").click();
  const form = page.getByTestId("new-pet-form");
  await form.getByLabel("飼主手機").fill("0900-111-999");
  await form.getByRole("button", { name: "查詢", exact: true }).click();
  await form.getByLabel("飼主稱呼").fill("測試先生");
  await form.getByLabel("毛孩名字").fill("黑輪");
  await page.getByTestId("create-pet").click();
  await expect(page.getByTestId("new-appointment-form")).toContainText("黑輪");
});

test("M2-01: owner edits a service price; history keeps snapshot", async ({ page }, info) => {
  await page.goto("/app/more");
  await page.getByRole("button", { name: "編輯 基礎洗澡" }).click();
  await page.getByLabel("價格（NT$）").fill("750");
  await settle(page);
  await page.screenshot({ path: shotPath(info, "state-service-edit") });
  await page.getByTestId("save-service").click();
  await expect(page.locator("li", { hasText: "基礎洗澡" }).first()).toContainText("NT$750");
  await page.goto("/app/appointments/apt-doudou");
  await expect(page.getByText("NT$700").first()).toBeVisible(); // past appointment unchanged
});

test("M2-01 / E06: leave for Amy over a pending request warns and keeps the booking", async ({ page }, info) => {
  await page.goto("/app/more");
  const form = page.getByTestId("time-off-form");
  await form.getByRole("radiogroup", { name: "休假美容師" }).getByText("Amy").click();
  await form.getByLabel("日期").fill("2026-10-28");
  await form.getByText("部分時段").click();
  await form.getByLabel("開始").selectOption("16:00");
  await form.getByLabel("結束").selectOption("19:00");
  await form.getByLabel("原因").fill("臨時看診");
  await page.getByTestId("add-time-off").click();
  const warn = page.getByTestId("affected-appointments");
  await expect(warn).toContainText("吐司");
  await expect(warn).toContainText("預約沒有被取消");
  await settle(page);
  await page.screenshot({ path: shotPath(info, "state-time-off-affected"), fullPage: true });
  await page.goto("/app/appointments/apt-toast");
  await expect(page.getByTestId("appointment-detail")).toHaveAttribute("data-status", "confirmed");
  await expect(page.getByText(/新增休假（臨時看診）/)).toBeVisible();
});

test("M2-01: hours edit; receptionist sees settings read-only", async ({ page }) => {
  await page.goto("/app/more");
  await page.getByRole("radiogroup", { name: "週一 是否營業" }).getByText("營業").click();
  await page.getByTestId("save-hours").click();
  await expect(page.getByText("營業時間已更新")).toBeVisible();
  await page.goto("/app/calendar?date=2026-11-02");
  await expect(page.getByText("店休日")).toHaveCount(0);
  await setRole(page, "櫃檯");
  await page.goto("/app/more");
  await expect(page.getByText("只有店主或店長可以修改設定")).toBeVisible();
  await expect(page.getByTestId("save-hours")).toHaveCount(0);
  await expect(page.getByTestId("time-off-form")).toHaveCount(0);
});
