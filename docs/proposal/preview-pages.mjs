// Renders each proposal page to a PNG (for visual QA) and reports pages whose content overflows the footer line.
// Usage: node docs/proposal/preview-pages.mjs <outDir>
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(process.argv[2] ?? "preview");
mkdirSync(out, { recursive: true });
const html = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.html");
const b = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
await p.goto("file://" + html);
await p.waitForTimeout(800);
const pages = await p.$$(".page");
for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(out, `p${String(i + 1).padStart(2, "0")}.png`) });
const over = await p.evaluate(() => [...document.querySelectorAll(".page")].map((el, i) => {
  const kids = [...el.children].filter((k) => !k.classList.contains("foot") && !k.classList.contains("run"));
  const last = kids.reduce((m, k) => Math.max(m, k.getBoundingClientRect().bottom), 0);
  const foot = el.querySelector(".foot")?.getBoundingClientRect().top ?? el.getBoundingClientRect().bottom;
  return { page: i + 1, overflowPx: Math.round(last - foot) };
}));
console.log("pages:", pages.length, "| overflowing (px past footer):", JSON.stringify(over.filter((o) => o.overflowPx > 0)));
await b.close();
