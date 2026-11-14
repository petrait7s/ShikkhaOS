// Captures phone-size screenshots of the OS-style UI (demo data) for docs/proposal/mobile-demo.html.
// Needs the demo build served on :3000. Usage: PW_EXECUTABLE=... node docs/proposal/capture-mobile.mjs
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "mobile-shots");
const UI = process.env.UI ?? "http://localhost:3000";
const b = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined, args: ["--no-sandbox"] });

async function phone(role, { dark = false, bn = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: dark ? "dark" : "light" });
  const p = await ctx.newPage();
  await p.goto(`${UI}/login/`);
  await p.waitForTimeout(600);
  if (dark) await p.evaluate(() => localStorage.setItem("theme", "dark"));
  if (bn) { await p.locator("button", { hasText: "বাংলা" }).first().click(); await p.waitForTimeout(500); }
  return { ctx, p, role };
}
const shot = (p, name) => p.screenshot({ path: path.join(out, `${name}.jpg`), type: "jpeg", quality: 82 });
const enter = async (p, role) => { await p.getByRole("button", { name: new RegExp(role, "i") }).first().click(); await p.waitForURL(/desktop/); await p.waitForTimeout(2200); };
const tab = (p, name) => p.getByRole("button", { name, exact: true }).click().then(() => p.waitForTimeout(700));
const openApp = async (p, label) => { await tab(p, "Menu"); await p.locator(".m-tile", { hasText: label }).click(); await p.waitForTimeout(1500); };

{ // login
  const { ctx, p } = await phone("Teacher"); await p.waitForTimeout(800); await shot(p, "01-login"); await ctx.close();
}
{ // teacher flow
  const { ctx, p } = await phone("Teacher"); await enter(p, "Teacher");
  await shot(p, "02-home-teacher");
  await tab(p, "Menu"); await shot(p, "03-apps");
  await openApp(p, "Marks Entry"); await shot(p, "04-marks-entry");
  await p.getByRole("button", { name: /Back/i }).first().click(); await p.waitForTimeout(500);
  await tab(p, "Alerts"); await shot(p, "05-alerts");
  await tab(p, "Me"); await shot(p, "06-me");
  await ctx.close();
}
{ // headmaster
  const { ctx, p } = await phone("Headmaster"); await enter(p, "Headmaster");
  await shot(p, "07-home-headmaster");
  await openApp(p, "Results Center"); await shot(p, "08-results-center");
  await ctx.close();
}
{ // student
  const { ctx, p } = await phone("Student"); await enter(p, "Student");
  await shot(p, "09-home-student");
  await openApp(p, "My Results"); await shot(p, "10-my-results");
  await ctx.close();
}
{ // bangla
  const { ctx, p } = await phone("Teacher", { bn: true }); await enter(p, "শিক্ষক|Teacher");
  await shot(p, "11-home-bangla");
  await ctx.close();
}
{ // dark
  const { ctx, p } = await phone("Teacher"); await enter(p, "Teacher");
  await tab(p, "Me"); await p.getByRole("button", { name: /Dark mode/ }).click(); await p.waitForTimeout(600);
  await tab(p, "Home"); await p.waitForTimeout(500); await shot(p, "12-dark-home");
  await ctx.close();
}
await b.close();
console.log("done");
