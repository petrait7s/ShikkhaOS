// Browser E2E for school SETUP against a LIVE API: roster import (+credentials CSV), teacher creation, forced password change,
// new exam with papers, headmaster authorization. Run after scripts/reset-live-db.sh with the live-mode UI served on :3000.
import ExcelJS from "exceljs";
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const UI = process.env.UI ?? "http://localhost:3000", PW = process.env.DEMO_PW ?? "Demo@Pass2026", NEW_PW = "Fresh#Pass2026x";
const SHOTS = process.env.SHOTS ?? "";
const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined, args: ["--no-sandbox"] });
const step = async (name, fn) => { try { await fn(); console.log("ok  ", name); } catch (e) { if (globalThis.__page && SHOTS) await globalThis.__page.screenshot({ path: `${SHOTS}/FAIL.png` }).catch(() => {}); console.log("FAIL", name, String(e).split("\n")[0]); throw e; } };

async function session(user, pw = PW) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  globalThis.__page = page;
  await page.goto(`${UI}/login/`);
  await page.locator('input[autocomplete="username"]').fill(user);
  await page.locator('input[type="password"]').fill(pw);
  await page.getByRole("button", { name: /Sign in/i }).last().click();
  await page.waitForURL(/desktop/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
async function openApp(page, name) {
  await page.keyboard.press("Control+k");
  await page.locator("[cmdk-input]").fill(name);
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}
const shot = async (page, n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };

// build the roster workbook
const dir = mkdtempSync(path.join(tmpdir(), "roster-"));
const xlsx = path.join(dir, "roster.xlsx");
{
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Roster");
  ws.addRow(["Student ID", "Roll", "Name", "Class", "Section", "Guardian", "Guardian Phone", "Date of Birth", "Gender"]);
  ws.addRow(["S-2026-901", 20, "Import Test One", 6, "A", "Guardian One", "01711111111", "2014-02-11", "Female"]);
  ws.addRow(["S-2026-902", 21, "Import Test Two", 6, "A", "Guardian Two", "01722222222", "2014-05-30", "Male"]);
  await wb.xlsx.writeFile(xlsx);
}

try {
  const r = await session("registrar");
  await step("registrar: import roster from Excel, credentials CSV downloads", async () => {
    await openApp(r.page, "Students");
    await r.page.getByRole("button", { name: /Import roster/i }).click();
    await r.page.locator('input[type="file"]').setInputFiles(xlsx);
    await r.page.waitForTimeout(800);
    const dl = r.page.waitForEvent("download", { timeout: 20000 });
    for (let i = 0; i < 6; i++) {
      const btn = r.page.getByRole("button", { name: /^(Validate|Review problem rows|Preview|Next|Import)/ }).last();
      if (!(await btn.count())) break;
      const label = (await btn.innerText()).trim();
      await btn.click();
      await r.page.waitForTimeout(700);
      if (/^Import/.test(label)) break;
    }
    const d = await dl;
    if (!/temporary-passwords/.test(d.suggestedFilename())) throw new Error("unexpected file " + d.suggestedFilename());
    await r.page.waitForTimeout(1200);
    await shot(r.page, "10-roster-imported");
    await r.page.getByRole("button", { name: /^Close$/ }).last().click().catch(() => {});
    await r.page.waitForTimeout(800);
    if (!/Import Test One/.test(await r.page.locator("body").innerText())) throw new Error("imported student not in list");
  });

  let teacherPw = "";
  await step("registrar: create a teacher (temporary password shown)", async () => {
    await openApp(r.page, "Teachers");
    await r.page.getByRole("button", { name: /Invite teacher/i }).click();
    const m = r.page.locator("[role=dialog]").last();
    const inputs = m.locator("input");
    await inputs.nth(0).fill("Setup Test Teacher");
    await inputs.nth(1).fill("01712345670");
    await inputs.nth(2).fill("setup.teacher@school.example");
    await inputs.nth(3).fill("Assistant Teacher");
    const dl = r.page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    await r.page.getByRole("button", { name: /Generate invite/i }).click();
    await r.page.waitForSelector("code", { timeout: 10000 });
    teacherPw = (await r.page.locator("[role=dialog] code").first().innerText()).trim();
    await dl;
    if (teacherPw.length < 8) throw new Error("no temporary password shown");
    await shot(r.page, "11-teacher-created");
    await r.page.locator("[role=dialog] .btn-primary").last().click();
    await r.page.waitForTimeout(600);
  });

  await step("registrar: create an exam (papers for every class subject)", async () => {
    await openApp(r.page, "Classes");
    await r.page.getByRole("tab", { name: /Exams/i }).click();
    await r.page.getByRole("button", { name: /New exam/i }).click();
    await r.page.getByLabel("Exam name", { exact: true }).fill("Annual Exam 2026");
    await r.page.locator("[role=dialog] .btn-primary").last().click();
    await r.page.waitForTimeout(2500);
    if (!/Annual Exam 2026/.test(await r.page.locator("body").innerText())) throw new Error("exam not listed");
    await shot(r.page, "12-exam-created");
  });
  await r.ctx.close();

  const h = await session("headmaster");
  await step("headmaster: authorize the new exam (password confirm)", async () => {
    await openApp(h.page, "Classes");
    await h.page.getByRole("tab", { name: /Exams/i }).click();
    await h.page.waitForTimeout(800);
    await h.page.locator("li", { hasText: "Annual Exam 2026" }).getByRole("button", { name: "Authorize" }).click();
    await h.page.waitForSelector("#reauth-pw", { timeout: 8000 });
    await h.page.locator("#reauth-pw").fill(PW);
    await h.page.getByRole("button", { name: /^Confirm$/ }).click();
    await h.page.waitForTimeout(2000);
    if (!/Authorized/.test(await h.page.locator("li", { hasText: "Annual Exam 2026" }).innerText())) throw new Error("exam not authorized");
    await shot(h.page, "13-exam-authorized");
  });
  await h.ctx.close();

  await step("new teacher: first sign-in forces a new password, then the desktop works", async () => {
    const t = await session("01712345670", teacherPw);
    await t.page.waitForSelector("#pg-cur", { timeout: 8000 });
    await shot(t.page, "14-force-password");
    await t.page.locator("#pg-cur").fill(teacherPw);
    await t.page.locator("#pg-new").fill(NEW_PW);
    await t.page.locator("#pg-new2").fill(NEW_PW);
    await t.page.getByRole("button", { name: /Save new password/i }).click();
    await t.page.waitForSelector("#pg-cur", { state: "detached", timeout: 8000 });
    await t.ctx.close();
    const again = await session("01712345670", NEW_PW);
    if (await again.page.locator("#pg-cur").count()) throw new Error("gate shown again after change");
    await again.ctx.close();
  });
  console.log("\nSETUP E2E PASSED");
} catch {
  console.log("\nSETUP E2E FAILED");
  process.exitCode = 1;
}
await browser.close();
