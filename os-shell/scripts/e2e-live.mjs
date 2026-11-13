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

  // 5. attendance, homework, messages
  const t2 = await session("teacher.rahim");
  await step("teacher: take attendance for 6-A", async () => {
    await openApp(t2.page, "Attendance");
    await t2.page.locator("select").first().selectOption({ label: "Class 6-A" }).catch(() => {});
    await t2.page.getByRole("button", { name: /Open roll call/i }).click();
    await t2.page.waitForSelector("table tbody tr", { timeout: 8000 });
    await t2.page.getByRole("button", { name: /Mark all present/i }).click();
    await t2.page.locator('[aria-label$="attendance"]').first().getByRole("button", { name: "A", exact: true }).click();
    await t2.page.getByRole("button", { name: /^Save$/ }).click();
    await t2.page.waitForTimeout(1500);
    await shot(t2.page, "05-attendance-teacher");
  });
  await step("teacher: create and publish homework for 6-A", async () => {
    await openApp(t2.page, "Homework");
    await t2.page.getByRole("button", { name: /New homework/i }).click();
    await t2.page.locator("#hw-class").selectOption({ label: (await t2.page.locator("#hw-class option").allTextContents()).find((x) => x.includes("6-A")) });
    await t2.page.locator("#hw-title").fill("Chapter 1 exercises");
    await t2.page.locator("#hw-desc").fill("Solve questions 1 to 10.");
    await t2.page.locator("#hw-due").fill("2030-01-01T10:00");
    await t2.page.getByRole("button", { name: /Save draft/i }).click();
    await t2.page.waitForTimeout(1200);
    await t2.page.getByRole("button", { name: /Chapter 1 exercises/ }).click();
    await t2.page.getByRole("button", { name: /Publish to students/i }).click();
    await t2.page.waitForTimeout(1200);
  });
  await step("teacher: message the 6-A class group", async () => {
    await openApp(t2.page, "Messages");
    await t2.page.locator("aside button", { hasText: /Class 6-A/ }).first().click();
    await t2.page.getByLabel("Message", { exact: true }).fill("Homework is up. Please check.");
    await t2.page.getByRole("button", { name: "Send" }).click();
    await t2.page.waitForTimeout(1200);
  });
  const s2 = await session("student.ayesha");
  await step("student: sees attendance", async () => {
    await openApp(s2.page, "Attendance");
    await s2.page.waitForTimeout(1500);
    await shot(s2.page, "06-attendance-student");
    if (!/Attendance/.test(await s2.page.locator("body").innerText())) throw new Error("no attendance view");
  });
  await step("student: sees and submits homework", async () => {
    await openApp(s2.page, "Homework");
    await s2.page.getByRole("button", { name: /Chapter 1 exercises/ }).click();
    await s2.page.locator("#hw-answer").fill("Done: answers attached in notebook.");
    await s2.page.getByRole("button", { name: /Submit homework/i }).click();
    await s2.page.waitForTimeout(1500);
    await shot(s2.page, "07-homework-student");
    if (!/Submitted/.test(await s2.page.locator("body").innerText())) throw new Error("not marked submitted");
  });
  await step("student: reads the class message, cannot post in group", async () => {
    await openApp(s2.page, "Messages");
    await s2.page.locator("aside button", { hasText: /Class 6-A/ }).first().click();
    await s2.page.waitForTimeout(1500);
    const txt = await s2.page.locator("body").innerText();
    if (!/Homework is up/.test(txt)) throw new Error("message not visible");
    if (await s2.page.getByLabel("Message", { exact: true }).count()) throw new Error("student can post in group");
    await shot(s2.page, "08-messages-student");
  });
  await step("student: starts a chat with a teacher", async () => {
    await s2.page.getByRole("button", { name: /New message/i }).click();
    await s2.page.getByRole("button", { name: /Rahim Uddin/ }).click();
    await s2.page.waitForTimeout(1500);
    await s2.page.getByLabel("Message", { exact: true }).fill("Sir, is Exercise 4.2 included?");
    await s2.page.getByRole("button", { name: "Send" }).click();
    await s2.page.waitForTimeout(1200);
  });
  await step("teacher: sees the student's message", async () => {
    await t2.page.reload();
    await t2.page.waitForTimeout(1500);
    await openApp(t2.page, "Messages");
    await t2.page.waitForTimeout(1500);
    if (!/Exercise 4.2/.test(await t2.page.locator("body").innerText())) throw new Error("teacher did not receive student message");
  });
  await t2.ctx.close(); await s2.ctx.close();
  console.log("\nALL STEPS PASSED");
} catch {
  console.log("\nE2E FAILED:", JSON.stringify(log.filter((l) => l[0] === "FAIL")));
  process.exitCode = 1;
}
await browser.close();
