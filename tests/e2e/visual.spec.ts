import { expect, test } from "@playwright/test";
import { noHorizontalOverflow, settle, shotPath, smallTargets, watchConsole } from "./helpers";

// Visual evidence for the five core screens + key states. Screenshots are evidence for review,
// NOT approved baselines (no toHaveScreenshot comparisons).
const PAGES = [
  { name: "today", path: "/app/today", ready: "今日工作" },
  { name: "pet-profile", path: "/app/pets/pet-coco", ready: "注意事項" },
  { name: "calendar", path: "/app/calendar", ready: "預約行事曆" },
  { name: "appointment-detail", path: "/app/appointments/apt-coco-today", ready: "照護注意事項" },
  { name: "booking", path: "/book/calm-studio", ready: "想預約什麼服務？" },
  { name: "pet-list", path: "/app/pets", ready: "毛孩" },
  { name: "settings", path: "/app/more", ready: "服務與設定" },
] as const;

for (const p of PAGES) {
  test(`${p.name}: renders, no console errors, no horizontal overflow`, async ({ page }, info) => {
    const errors = watchConsole(page);
    await page.goto(p.path);
    await expect(page.getByText(p.ready, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await settle(page);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: shotPath(info, p.name) });
    await page.screenshot({ path: shotPath(info, `${p.name}-full`), fullPage: true });
    const small = await smallTargets(page);
    info.annotations.push({ type: "small-targets", description: small.join(" | ") || "none" });
    expect(errors).toEqual([]);
  });
}

test("key states: finish review, ready_pickup payment, booking slots, pet care tab", async ({ page }, info) => {
  const errors = watchConsole(page);
  await page.goto("/app/appointments/apt-coco-today?action=finish");
  await expect(page.getByTestId("finish-review")).toBeVisible();
  await page.getByText("有異常狀況").click();
  await settle(page);
  await page.screenshot({ path: shotPath(info, "state-finish-review"), fullPage: true });

  await page.goto("/app/appointments/apt-lucky");
  await expect(page.getByTestId("open-payment")).toBeVisible();
  await page.getByTestId("open-payment").click();
  await settle(page);
  await page.screenshot({ path: shotPath(info, "state-ready-pickup-payment"), fullPage: true });

  await page.goto("/book/calm-studio");
  await page.getByText("洗澡＋修剪", { exact: true }).click();
  await page.getByRole("button", { name: "下一步" }).last().click();
  await expect(page.getByTestId("slot-list")).toBeVisible();
  await page.getByRole("tab", { name: /29/ }).click();
  await settle(page);
  await page.screenshot({ path: shotPath(info, "state-booking-slots"), fullPage: true });

  await page.goto("/app/pets/pet-coco");
  await page.getByRole("tab", { name: "照護資訊" }).click();
  await settle(page);
  await page.screenshot({ path: shotPath(info, "state-pet-care"), fullPage: true });
  expect(errors).toEqual([]);
});

test("empty, error and fallback states", async ({ page }, info) => {
  // Pet without photo / weight / birthdate never shows "0 kg" or a fake age.
  await page.goto("/app/pets/pet-orange");
  await expect(page.getByTestId("pet-name")).toHaveText("橘子");
  await expect(page.getByText("體重未提供").first()).toBeVisible();
  await expect(page.getByText("年齡未提供").first()).toBeVisible();
  await expect(page.getByText("0 kg")).toHaveCount(0);
  await settle(page);
  await page.screenshot({ path: shotPath(info, "state-pet-no-data") });

  // Closed day (Monday) in the calendar.
  await page.goto("/app/calendar?date=2026-11-02");
  await expect(page.getByText(/店休/).first()).toBeVisible();

  // Pet search with no results.
  await page.goto("/app/pets");
  await page.getByTestId("pet-search").fill("不存在的毛孩");
  await expect(page.getByText("找不到「不存在的毛孩」")).toBeVisible();

  // Offline load → error with retry instead of an empty list.
  await page.goto("/app/today");
  await page.evaluate(() => localStorage.setItem("petos-demo-settings-v1", JSON.stringify({ offline: true })));
  await page.reload();
  await expect(page.getByText("目前離線").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "重試" }).first()).toBeVisible();
  await settle(page);
  await page.screenshot({ path: shotPath(info, "state-today-offline") });
});

test("extra viewports 375 / 768 / 1024: no horizontal overflow", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "runs once");
  for (const [w, h] of [[375, 812], [768, 1024], [1024, 768]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "zh-TW", timezoneId: "Asia/Taipei" });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(p.path);
      await expect(page.getByText(p.ready, { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await settle(page);
      await noHorizontalOverflow(page);
      if (p.name === "today" || p.name === "calendar") await page.screenshot({ path: `artifacts/screenshots/${p.name}-${w}.png` });
    }
    await ctx.close();
  }
});
