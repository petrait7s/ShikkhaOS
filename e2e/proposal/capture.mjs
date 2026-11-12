// Builds a realistic demo school state through the real API, then screenshots the real UI for the project proposal.
// DEMO DATA ONLY (invented names/marks). Output: docs/proposal/shots/*.jpg
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const WEB = process.env.WEB, API = process.env.API, PW = "Demo@Pass2026";
const OUT = path.resolve("docs/proposal/shots"); mkdirSync(OUT, { recursive: true });

async function api(method, p, tok, body, h = {}) {
  const r = await fetch(API + p, { method, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...h }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(j)}`);
  return j?.data;
}
const login = async (u) => (await api("POST", "/auth/login", null, { identifier: u, password: PW, deviceId: crypto.randomUUID(), platform: "android" })).accessToken;
const reauth = async (t) => (await api("POST", "/auth/reauth", t, { password: PW })).reauthToken;
const score = (i, base = 58, spread = 40) => Math.min(100, Math.round(base + ((i * 37 + 11) % spread)));

const NAMES = ["Sadia Islam", "Imran Hossain", "Mahin Chowdhury", "Tasnim Akter", "Rakib Hasan", "Nabila Karim", "Arif Rahman", "Mehjabin Noor", "Shafin Ahmed", "Labiba Sultana", "Tanvir Alam", "Jannat Ferdous", "Fahim Uddin", "Ritu Barua", "Zihad Mia", "Anika Tabassum", "Sabbir Ahmed", "Maisha Rahman", "Nafis Iqbal", "Orpita Das", "Yasin Arafat", "Sumaiya Khanam", "Raihan Kabir", "Tamanna Haque", "Mushfiq Islam", "Farzana Yeasmin", "Ayman Chowdhury", "Puja Sen", "Hasib Anwar", "Nusaiba Khan"];

const [hm, reg, rahim, salma, ayesha, farhan] = await Promise.all(["headmaster", "registrar", "teacher.rahim", "teacher.salma", "student.ayesha", "student.farhan"].map(login));
const classes = await api("GET", "/classes", reg), subjects = await api("GET", "/subjects", reg), sections = await api("GET", "/sections", reg);
const class6 = classes.find((c) => c.name === "Class 6").id, sub = Object.fromEntries(subjects.map((s) => [s.code, s.id]));
const secA = sections.find((s) => s.name === "A").id, secB = sections.find((s) => s.name === "B").id;

// ---- 1. more students (CSV import) so lists, charts and reports look like a real class
const rows = NAMES.map((n, i) => { const a = i < 15; return `S-2026-${String(101 + i)},${n},2014-0${(i % 9) + 1}-1${i % 9},${i % 2 ? "MALE" : "FEMALE"},Guardian of ${n.split(" ")[0]},017${String(10000000 + i * 137).slice(0, 8)},Sylhet,Class 6,${a ? "A" : "B"},${a ? 6 + i : 4 + (i - 15)}`; });
await api("POST", "/students/import", reg, { csv: "studentCode,fullName,dob,gender,guardianName,guardianPhone,address,className,sectionName,rollNo\n" + rows.join("\n") + "\n", dryRun: false });

async function sheet(tok, id) { return api("GET", `/mark-submissions/${id}`, tok); }
async function fill(tok, id, { upTo, base, spread, absent = -1 }) {
  const d = await sheet(tok, id);
  const entries = d.entries.map((e, i) => (i === absent ? { studentId: e.studentId, absent: true } : i < (upTo ?? 999) ? { studentId: e.studentId, marksObtained: score(i, base, spread), absent: false } : { studentId: e.studentId, marksObtained: null, absent: false }));
  await api("PUT", `/mark-submissions/${id}/entries`, tok, { entries });
}
const mine = async (tok) => (await api("GET", "/mark-submissions?limit=100", tok));

// ---- 2. Exam 1: First Term (Math) -> compiled, waiting for the Headmaster's approval
const ex1 = await api("POST", "/exams", reg, { name: "First Term Exam 2026", type: "TERM", startDate: "2026-03-01", endDate: "2026-03-10" });
await api("POST", "/exam-papers", reg, { examId: ex1.id, classId: class6, subjectId: sub.MATH });
await api("POST", `/exams/${ex1.id}/authorize`, hm);
for (const s of (await mine(rahim)).filter((s) => s.examId === ex1.id)) {
  await fill(rahim, s.id, { base: 52, spread: 46, absent: s.sectionName === "B" ? 3 : -1 });
  await api("POST", `/mark-submissions/${s.id}/submit`, rahim); await api("POST", `/mark-submissions/${s.id}/start-review`, reg); await api("POST", `/mark-submissions/${s.id}/verify`, reg);
}
const rs1 = await api("POST", "/result-sets", reg, { examId: ex1.id, classId: class6 });

// ---- 3. Exam 2: Half Yearly (3 subjects) -> every stage of the workflow is visible
const ex2 = await api("POST", "/exams", reg, { name: "Half Yearly Exam 2026", type: "MID_TERM", startDate: "2026-06-15", endDate: "2026-06-25" });
for (const code of ["MATH", "ENG", "BAN"]) await api("POST", "/exam-papers", reg, { examId: ex2.id, classId: class6, subjectId: sub[code] });
await api("POST", `/exams/${ex2.id}/authorize`, hm);
const find = async (tok, code, sec) => (await mine(tok)).find((s) => s.examId === ex2.id && s.subjectCode === code && s.sectionName === sec);
const mathA = await find(rahim, "MATH", "A"), mathB = await find(rahim, "MATH", "B"), engA = await find(salma, "ENG", "A"), engB = await find(salma, "ENG", "B"), banA = await find(salma, "BAN", "A");
await fill(rahim, mathA.id, { base: 55, spread: 42 }); await api("POST", `/mark-submissions/${mathA.id}/submit`, rahim);           // SUBMITTED
await fill(rahim, mathB.id, { upTo: 9, base: 50, spread: 40 });                                                                      // DRAFT (partly entered)
await fill(salma, engA.id, { base: 60, spread: 36 }); await api("POST", `/mark-submissions/${engA.id}/submit`, salma); await api("POST", `/mark-submissions/${engA.id}/start-review`, reg); // UNDER_REVIEW
await fill(salma, engB.id, { base: 48, spread: 50 }); await api("POST", `/mark-submissions/${engB.id}/submit`, salma); await api("POST", `/mark-submissions/${engB.id}/start-review`, reg);
const engBd = await sheet(reg, engB.id);
await api("POST", `/mark-submissions/${engB.id}/request-correction`, reg, { reason: "Roll 5 and roll 9 totals look different from the answer sheets. Please re-check.", items: [{ studentId: engBd.entries[4].studentId, note: "Check Q3 total" }, { studentId: engBd.entries[8].studentId, note: "Marks above 100?" }] });
await fill(salma, banA.id, { base: 57, spread: 40 }); await api("POST", `/mark-submissions/${banA.id}/submit`, salma);                // SUBMITTED

// ---- 4. attendance for the last 12 school days (class teacher of 6-A)
{
  let d = new Date(); let made = 0;
  while (made < 12) {
    if (![5, 6].includes(d.getUTCDay())) {
      const date = d.toISOString().slice(0, 10);
      const s = await api("POST", "/attendance-sessions", rahim, { sectionId: secA, date });
      await api("PUT", `/attendance-sessions/${s.id}/records`, rahim, { records: s.records.map((r, i) => ({ studentId: r.studentId, status: (i * 7 + made * 3) % 13 === 0 ? "ABSENT" : (i + made) % 17 === 0 ? "LATE" : "PRESENT" })) });
      made++;
    }
    d = new Date(d.getTime() - 86400000);
  }
}
// ---- 5. class test, homework, notices, messages
const assignA = (await api("GET", "/teacher-assignments", rahim)).find((a) => a.sectionId === secA && a.subjectId === sub.MATH);
const ct = await api("POST", "/class-tests", rahim, { teacherAssignmentId: assignA.id, title: "Algebra — Unit Test 1", date: new Date().toISOString().slice(0, 10), fullMarks: 20 });
await api("PUT", `/class-tests/${ct.id}/marks`, rahim, { marks: ct.marks.map((m, i) => ({ studentId: m.studentId, marks: Math.min(20, 9 + ((i * 5) % 12)), absent: false })) });
await api("POST", `/class-tests/${ct.id}/share`, rahim);
const hw = await api("POST", "/homework", rahim, { teacherAssignmentId: assignA.id, title: "Chapter 4 — Exercise 4.2 (Q1–Q10)", description: "Solve all ten problems in your notebook. Show every step.", dueAt: new Date(Date.now() + 3 * 86400000).toISOString() });
await api("POST", `/homework/${hw.id}/publish`, rahim);
const sa = await api("POST", `/homework/${hw.id}/submissions`, ayesha, { text: "Solved Q1–Q10. Q7 uses the distributive property." });
await api("POST", `/homework/${hw.id}/submissions`, farhan, { text: "All ten done." });
await api("PATCH", `/homework-submissions/${sa.id}`, rahim, { grade: "A", feedback: "Neat work. Keep showing the steps like in Q7." });
for (const [title, body, pinned] of [["Half Yearly Exam routine published", "The Half Yearly Exam starts on 15 June. Class 6 routine is on the notice board. Please arrive 15 minutes early.", true], ["Winter vacation notice", "The school will remain closed from 24 December to 2 January. Classes resume on 3 January.", false]]) {
  const n = await api("POST", "/notices", hm, { title, body, pinned, audience: { roles: [], classIds: [], sectionIds: [] } }); await api("POST", `/notices/${n.id}/publish`, hm);
}
const users = await api("GET", "/users?limit=100", hm); const rahimUser = users.find((u) => u.username === "teacher.rahim").id;
const dm = await api("POST", "/conversations", ayesha, { type: "DIRECT", recipientId: rahimUser });
await api("POST", `/conversations/${dm.id}/messages`, ayesha, { body: "Sir, is Exercise 4.2 due on Monday?" });
await api("POST", `/conversations/${dm.id}/messages`, rahim, { body: "Yes, Ayesha. Please submit it through the app before class." });
await api("POST", `/conversations/${dm.id}/messages`, ayesha, { body: "Thank you, Sir! Submitted." });
const grp = (await api("GET", "/conversations", rahim)).find((c) => c.type === "CLASS_GROUP" && c.title.endsWith("-A"));
await api("POST", `/conversations/${grp.id}/messages`, rahim, { body: "Reminder: bring your geometry box tomorrow for the practical." });
const ann = (await api("GET", "/channels", hm)).find((c) => c.channelKind === "ANNOUNCEMENTS");
await api("POST", `/channels/${ann.id}/posts`, hm, { body: "Welcome to ShikkhaOS! Notices and results will appear here and in your notifications." });

// ---- screenshots
const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined, args: ["--no-sandbox"] });
let n = 0; const log = [];
async function session(user, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, ...opts });
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  await page.goto(WEB + "/"); await page.getByLabel("Username, email or student ID").fill(user); await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click(); await page.getByRole("navigation", { name: "Main" }).waitFor().catch(() => page.getByRole("heading").first().waitFor());
  return { ctx, page };
}
async function shot(page, name, { fullPage = false, clip } = {}) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, "0")}-${name}.jpg`), type: "jpeg", quality: 86, fullPage, clip });
  log.push(name);
}
async function go(page, p, readyText) { await page.goto(WEB + p); if (readyText) await page.getByText(readyText).first().waitFor(); await page.waitForTimeout(300); }
const safe = async (name, fn) => { try { await fn(); } catch (e) { console.error(`SHOT FAILED ${name}: ${String(e).split("\n")[0]}`); } };

{ const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 }); const page = await ctx.newPage(); await page.goto(WEB + "/"); await page.getByRole("button", { name: "Sign in" }).waitFor(); await shot(page, "login"); await ctx.close(); }

await safe("headmaster", async () => {
  const { ctx, page } = await session("headmaster");
  await page.getByText("awaiting your approval").waitFor(); await shot(page, "headmaster-dashboard");
  await go(page, "/results", "First Term Exam 2026"); await shot(page, "results-list");
  await page.getByRole("row").filter({ hasText: "First Term" }).click(); await page.getByRole("button", { name: "Approve" }).waitFor(); await shot(page, "results-approval", { fullPage: false });
  await go(page, `/exams/${ex2.id}`, "Marks progress"); await shot(page, "exam-progress");
  await go(page, "/exams", "Half Yearly"); await shot(page, "exams-list");
  await go(page, "/reports"); await page.getByRole("heading", { name: "Reports" }).waitFor(); await page.getByLabel("Report", { exact: true }).selectOption("result-distribution"); await page.getByRole("tab", { name: "Chart" }).click().catch(() => page.getByRole("button", { name: "Chart" }).click()); await shot(page, "reports-chart");
  await go(page, "/permissions"); await page.getByRole("row").filter({ hasText: "registrar" }).first().click(); await page.getByRole("dialog").waitFor(); await shot(page, "permissions");
  await go(page, "/audit"); await page.getByText("result_set.compiled").first().waitFor(); await shot(page, "audit-log");
  await go(page, "/settings", "Policies"); await shot(page, "settings-policies");
  await ctx.close();
});
// publish exam 1 now (Headmaster approval + publish) so students can see a result
{ await api("POST", `/result-sets/${rs1.id}/approve`, hm, {}, { "x-reauth-token": await reauth(hm) }); await api("POST", `/result-sets/${rs1.id}/publish`, hm, {}, { "x-reauth-token": await reauth(hm) }); await api("POST", `/result-sets/${rs1.id}/report-cards`, reg); }

await safe("registrar", async () => {
  const { ctx, page } = await session("registrar");
  await go(page, "/students", "Rahman"); await page.getByRole("heading", { name: "Students" }).waitFor(); await shot(page, "students-registry");
  await go(page, "/review", "Awaiting review"); await shot(page, "review-inbox");
  await page.getByRole("button", { name: "Under review" }).click().catch(() => page.getByText("Under review").first().click()); await page.getByRole("row").filter({ hasText: "English" }).first().click(); await page.getByRole("button", { name: "Request correction" }).waitFor(); await shot(page, "review-detail");
  await ctx.close();
});
await safe("teacher-marks", async () => {
  const { ctx, page } = await session("teacher.rahim");
  await go(page, "/marks", "Marks entry"); await shot(page, "marks-list");
  await page.getByRole("row").filter({ hasText: "Half Yearly" }).filter({ hasText: "Class 6-B" }).first().click(); await page.getByLabel(/Marks for/).first().waitFor(); await shot(page, "marks-entry-grid");
  await go(page, "/attendance"); await page.getByLabel("Section").selectOption({ label: "Class 6-A" }); await page.getByText("Mark all present").waitFor(); await shot(page, "attendance-roll-call");
  await go(page, "/class-tests", "Algebra"); await shot(page, "class-tests");
  await go(page, "/homework", "Chapter 4"); await shot(page, "homework-teacher");
  await ctx.close();
});
await safe("teacher-correction", async () => {
  const { ctx, page } = await session("teacher.salma");
  await page.getByText(/correction request/i).first().waitFor(); await shot(page, "teacher-dashboard-correction");
  await go(page, "/marks"); await page.getByRole("row").filter({ hasText: "Half Yearly" }).filter({ hasText: "English" }).filter({ hasText: "6-B" }).first().click(); await page.getByRole("alert").filter({ hasText: "re-check" }).waitFor(); await shot(page, "correction-requested");
  await ctx.close();
});
await safe("student-desktop", async () => {
  const { ctx, page } = await session("student.ayesha");
  await page.getByRole("heading", { name: /Welcome/ }).waitFor(); await page.waitForTimeout(800); await shot(page, "student-dashboard");
  await go(page, "/my-results", "First Term Exam 2026"); await shot(page, "student-result");
  await go(page, "/messages"); await page.locator(".conv", { hasText: "Rahim" }).first().click(); await page.getByText("Thank you, Sir").first().waitFor(); await shot(page, "messages-chat");
  await go(page, "/notices", "Half Yearly Exam routine"); await shot(page, "notices");
  await ctx.close();
});
await safe("student-phone", async () => {
  const { ctx, page } = await session("student.ayesha", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.getByRole("heading", { name: /Welcome/ }).waitFor(); await page.waitForTimeout(800); await shot(page, "phone-dashboard");
  await go(page, "/my-results", "First Term Exam 2026"); await shot(page, "phone-result");
  await go(page, "/my-attendance"); await page.getByText("Present").first().waitFor(); await shot(page, "phone-attendance");
  await page.getByRole("button", { name: "Menu" }).click(); await page.getByRole("navigation", { name: "Main" }).waitFor(); await shot(page, "phone-menu");
  await ctx.close();
});
await browser.close();
console.log(`captured ${log.length} screenshots: ${log.join(", ")}`);
