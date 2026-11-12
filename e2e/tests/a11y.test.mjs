import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { launch, signIn, WEB } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

async function violations(page, label) {
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => await globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  const v = res.violations.map((x) => `${x.id} (${x.impact}) x${x.nodes.length}: ${x.help} -> ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  assert.deepEqual(v, [], `${label}: accessibility violations`);
}
async function visit(page, name, path, ready) {
  await page.goto(WEB + path);
  await ready(page);
  await violations(page, name);
}

test("login screen has no WCAG 2.1 A/AA violations (light and dark)", async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.goto(WEB + "/");
  await page.getByRole("button", { name: "Sign in" }).waitFor();
  await violations(page, "login-light");
  await page.emulateMedia({ colorScheme: "dark" }); await page.reload(); await page.getByRole("button", { name: "Sign in" }).waitFor();
  await violations(page, "login-dark");
  await ctx.close();
});

test("teacher: dashboard, marks, attendance, messages, notices are accessible", async () => {
  const { ctx, page } = await signIn(browser, "teacher.rahim");
  await page.getByRole("heading", { name: /Welcome/ }).waitFor();
  await violations(page, "teacher-dashboard");
  await visit(page, "teacher-marks-list", "/marks", (p) => p.getByRole("heading", { name: "Marks entry" }).waitFor());
  await visit(page, "teacher-attendance", "/attendance", (p) => p.getByRole("heading", { name: "Attendance" }).waitFor());
  await visit(page, "teacher-messages", "/messages", (p) => p.getByRole("heading", { name: "Messages" }).waitFor());
  await visit(page, "teacher-notices", "/notices", (p) => p.getByRole("heading", { name: "Notices" }).waitFor());
  await visit(page, "teacher-profile", "/profile", (p) => p.getByRole("heading", { name: /Profile/ }).waitFor());
  await ctx.close();
});

test("student pages are accessible", async () => {
  const { ctx, page } = await signIn(browser, "student.ayesha");
  await page.getByRole("heading", { name: /Welcome/ }).waitFor();
  await violations(page, "student-dashboard");
  await visit(page, "student-results", "/my-results", (p) => p.getByRole("heading", { name: "My results" }).waitFor());
  await visit(page, "student-attendance", "/my-attendance", (p) => p.getByRole("heading", { name: "My attendance" }).waitFor());
  await visit(page, "student-homework", "/my-homework", (p) => p.getByRole("heading", { name: "Homework" }).waitFor());
  await ctx.close();
});

test("registrar and headmaster administration screens are accessible", async () => {
  const R = await signIn(browser, "registrar");
  await R.page.getByRole("heading", { name: /Welcome/ }).waitFor();
  await violations(R.page, "registrar-dashboard");
  await visit(R.page, "registrar-students", "/students", (p) => p.getByRole("heading", { name: "Students" }).waitFor());
  await visit(R.page, "registrar-exams", "/exams", (p) => p.getByRole("heading", { name: "Exams" }).waitFor());
  await visit(R.page, "registrar-review", "/review", (p) => p.getByRole("heading", { name: "Submissions inbox" }).waitFor());
  await visit(R.page, "registrar-reports", "/reports", (p) => p.getByRole("heading", { name: "Reports" }).waitFor());
  await R.ctx.close();
  const H = await signIn(browser, "headmaster");
  await violations(H.page, "headmaster-dashboard");
  await visit(H.page, "headmaster-audit", "/audit", (p) => p.getByRole("heading", { name: "Audit log" }).waitFor());
  await visit(H.page, "headmaster-permissions", "/permissions", (p) => p.getByRole("heading", { name: "Roles & permissions" }).waitFor());
  await visit(H.page, "headmaster-settings", "/settings", (p) => p.getByRole("heading", { name: "School settings" }).waitFor());
  await H.ctx.close();
});
