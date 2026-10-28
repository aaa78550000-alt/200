// Builds the demo app as ONE html fragment (CSS + JS + images inlined) for hosting as a claude.ai artifact.
// The host wraps the fragment in its own <html>/<head>/<body>, so those tags are stripped here.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

execSync("npx vite build --mode embedded", { stdio: "inherit" });
const dir = "dist-embedded";
let html = readFileSync(path.join(dir, "artifact.html"), "utf8");
const assets = path.join(dir, "assets");
for (const f of readdirSync(assets)) {
  const content = readFileSync(path.join(assets, f), "utf8");
  if (f.endsWith(".css")) {
    html = html.replace(new RegExp(`<link rel="stylesheet"[^>]*href="\\./assets/${f.replace(".", "\\.")}"[^>]*>`), () => `<style>${content}</style>`);
  } else if (f.endsWith(".js")) {
    const safe = content.replace(/<\/script/gi, "<\\/script");
    html = html.replace(new RegExp(`<script type="module"[^>]*src="\\./assets/${f.replace(".", "\\.")}"[^>]*></script>`), () => `<script type="module">${safe}</script>`);
  }
}
if (/\.\/assets\//.test(html)) throw new Error("un-inlined asset reference left in the page");
html = html
  .replace(/<!doctype html>/i, "")
  .replace(/<\/?html[^>]*>/gi, "")
  .replace(/<\/?head>/gi, "")
  .replace(/<\/?body>/gi, "")
  .replace(/<meta charset="UTF-8" \/>/i, "");
// Side gutters are the app's own 16px (no safe-area side cover meta).
html = html.trim();
writeFileSync(path.join(dir, "PetOS.html"), html);
console.log(`dist-embedded/PetOS.html ${(html.length / 1024).toFixed(0)} KB`);
