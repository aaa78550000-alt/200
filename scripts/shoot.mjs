// Quick screenshot helper for design iteration: node scripts/shoot.mjs <outdir> [path...]
import { chromium } from "playwright";
const out = process.argv[2] ?? "artifacts/visual/scratch";
const paths = process.argv.slice(3).length ? process.argv.slice(3) : ["/app/today", "/app/pets/pet-coco", "/app/calendar", "/app/appointments/apt-coco-today", "/book/calm-studio"];
const base = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch();
for (const [w, h, tag] of [[390, 844, "mobile"], [1440, 900, "desktop"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: "zh-TW", timezoneId: "Asia/Taipei" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const name = p.replace(/^\//, "").replace(/[/?=&]/g, "_");
    const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: `${out}/${name}-${tag}.png`, fullPage: process.env.FULL === "1" });
    console.log(tag, p, "overflowX:", overflow);
  }
  if (errors.length) console.log("CONSOLE ERRORS", tag, errors);
  await ctx.close();
}
await browser.close();
