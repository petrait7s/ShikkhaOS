// Browser E2E against a LIVE API + the http-mode UI (served on UI, default http://localhost:3000).
// Flow: teacher enters+submits marks -> registrar verifies -> headmaster approves+publishes (password re-confirm) -> student sees result.
// Needs: API running with demo seed + scripts/seed-live-demo.mjs. Usage: node scripts/e2e-live.mjs  (run from a dir where "playwright" resolves)
import { chromium } from "playwright";

const UI = process.env.UI ?? "http://localhost:3000", PW = process.env.DEMO_PW ?? "Demo@Pass2026";
const SHOTS = process.env.SHOTS ?? "";
const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined, args: ["--no-sandbox"] });
const log = [];
const step = async (name, fn) => { try { await fn(); log.push(["ok", name]); console.log("ok  ", name); } catch (e) { log.push(["FAIL", name, String(e).split("\n")[0]]); console.log("FAIL", name, String(e).split("\n")[0]); throw e; } };

async function session(user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${UI}/login/`);
  await page.locator('input[autocomplete="username"]').fill(user);
  await page.locator('input[type="password"]').fill(PW);
  await page.getByRole("button", { name: /Sign in/i }).last().click();
  await page.waitForURL(/desktop/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}
async function openApp(page, name) {
  await page.keyboard.press("Control+k");
  await page.locator("[cmdk-input]").fill(name);
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}
const shot = async (page, n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };

try {
  // 1. teacher enters and submits marks for both sections
  const t = await session("teacher.rahim");
  await step("teacher: open Marks Entry", () => openApp(t.page, "Marks Entry"));
  for (const sec of ["6-A", "6-B"]) {
    await step(`teacher: fill and submit Class ${sec}`, async () => {
      await t.page.locator("aside button", { hasText: new RegExp(`Class ${sec}`) }).first().click();
      await t.page.waitForTimeout(1200);
      const inputs = t.page.locator('input[aria-label$="Marks"]');
      const n = await inputs.count();
      if (n === 0) throw new Error("no mark inputs");
      for (let i = 0; i < n; i++) await inputs.nth(i).fill(String(55 + ((i * 7) % 40)));
      await t.page.waitForTimeout(1500);
      await shot(t.page, `01-teacher-${sec}`);
      await t.page.getByRole("button", { name: /Submit marks/i }).click();
      await t.page.getByRole("button", { name: /Submit marks/i }).last().click();
      await t.page.waitForTimeout(1500);
    });
  }
  await t.ctx.close();

  // 2. registrar verifies both sheets
  const r = await session("registrar");
  await step("registrar: open Results Center", () => openApp(r.page, "Results Center"));
  for (const sec of ["6-A", "6-B"]) {
    await step(`registrar: verify Class ${sec} Mathematics`, async () => {
      await r.page.locator("table button", { hasText: /Submitted/ }).first().click();
      await r.page.waitForTimeout(1000);
      await r.page.getByRole("button", { name: /^Verify$/ }).click();
      await r.page.waitForTimeout(1500);
      await r.page.locator('button[aria-label="Close"]').first().click().catch(() => {});
    });
  }
  await shot(r.page, "02-registrar-verified");
  await r.ctx.close();

  // 3. headmaster approves + publishes (password confirmation)
  const h = await session("headmaster");
  await step("headmaster: open Results Center", () => openApp(h.page, "Results Center"));
  await step("headmaster: publish all ready classes (password confirm)", async () => {
    await h.page.getByRole("button", { name: /Publish all ready classes/i }).click();
    await h.page.waitForTimeout(800);
    await h.page.getByRole("button", { name: /Publish|Confirm/i }).last().click().catch(() => {});
    await h.page.waitForSelector("#reauth-pw", { timeout: 8000 });
    await h.page.locator("#reauth-pw").fill(PW);
    await h.page.getByRole("button", { name: /^Confirm$/ }).click();
    await h.page.waitForTimeout(1500);
    if (await h.page.waitForSelector("#reauth-pw", { timeout: 4000 }).then(() => true).catch(() => false)) {
      await h.page.locator("#reauth-pw").fill(PW);
      await h.page.getByRole("button", { name: /^Confirm$/ }).click();
    }
    await h.page.waitForTimeout(2500);
    await shot(h.page, "03-headmaster-published");
  });
  await h.ctx.close();

  // 4. student sees the published result
  const s = await session("student.ayesha");
  await step("student: My Results shows the exam", async () => {
    await openApp(s.page, "My Results");
    await s.page.waitForTimeout(1500);
    await shot(s.page, "04-student-result");
    const txt = await s.page.locator("body").innerText();
    if (!/Half Yearly/i.test(txt)) throw new Error("exam not visible to student");
  });
  await s.ctx.close();
  console.log("\nALL STEPS PASSED");
} catch {
  console.log("\nE2E FAILED:", JSON.stringify(log.filter((l) => l[0] === "FAIL")));
  process.exitCode = 1;
}
await browser.close();
