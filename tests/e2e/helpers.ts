import { expect, type Page, type TestInfo } from "@playwright/test";

/** Collects console errors / page errors; assert empty at the end of each test. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}

/** Every visible enabled button/link must be at least 44px in one dimension and 32px in the other (text links in prose excluded). */
export async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>("button, a[href], [role=tab], [role=radio], input[type=checkbox]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || el.closest("[aria-hidden=true]")) return;
      if (el.tagName === "A" && style.display === "inline") return;
      if ((el as HTMLInputElement).type === "checkbox" && el.closest("label")) return;
      if (Math.max(r.width, r.height) < 44 || Math.min(r.width, r.height) < 32) out.push(`${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    });
    return out;
  });
}

export function shotPath(info: TestInfo, name: string) {
  return `artifacts/screenshots/${name}-${info.project.name}.png`;
}

export async function setDemo(page: Page, toggle: "demo-offline" | "demo-line-fails" | "demo-slot-race", on = true) {
  await page.getByTestId("demo-tools").click();
  const box = page.getByTestId(toggle);
  if ((await box.isChecked()) !== on) await box.click();
  await page.keyboard.press("Escape");
}

export async function setRole(page: Page, label: "店主" | "櫃檯" | "美容師") {
  await page.getByTestId("demo-tools").click();
  await page.getByRole("radiogroup", { name: "目前角色" }).getByText(label, { exact: true }).click();
  await page.keyboard.press("Escape");
}
