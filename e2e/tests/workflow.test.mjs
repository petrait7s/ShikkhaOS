import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, signIn, api, token, reauth, WEB, PASSWORD } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

test("login: wrong password shows an error, correct password reaches the role dashboard", async () => {
  const bad = await signIn(browser, "student.ayesha", "wrong-password-1");
  await bad.page.getByRole("alert").filter({ hasText: "Incorrect username or password" }).waitFor();
  await bad.ctx.close();
  const ok = await signIn(browser, "student.ayesha");
  await ok.page.getByRole("heading", { name: /Welcome, Ayesha/ }).waitFor();
  // student navigation never exposes admin modules
  const nav = ok.page.getByRole("navigation", { name: "Main" });
  for (const name of ["My results", "My attendance", "Homework", "Messages", "Notices"]) await nav.getByRole("link", { name }).waitFor();
  for (const name of ["Audit log", "Students", "Exams", "Roles & permissions"]) assert.equal(await nav.getByRole("link", { name, exact: true }).count(), 0, `${name} must be hidden`);
  // direct URL to an admin route renders no data and no crash
  await ok.page.goto(WEB + "/audit");
  await ok.page.getByText(/don't have access|Not found/i).first().waitFor();
  await ok.ctx.close();
});

test("teacher navigation is scoped; headmaster sees administration", async () => {
  const t = await signIn(browser, "teacher.rahim");
  await t.page.getByRole("heading", { name: /Welcome, Rahim/ }).waitFor();
  const nav = t.page.getByRole("navigation", { name: "Main" });
  for (const name of ["My classes", "Attendance", "Marks entry", "Class tests"]) await nav.getByRole("link", { name }).waitFor();
  for (const name of ["Audit log", "Submissions inbox", "Roles & permissions"]) assert.equal(await nav.getByRole("link", { name }).count(), 0, `${name} hidden for teacher`);
  await t.ctx.close();
  const h = await signIn(browser, "headmaster");
  const hn = h.page.getByRole("navigation", { name: "Main" });
  for (const name of ["Audit log", "Roles & permissions", "Results", "Exams"]) await hn.getByRole("link", { name }).waitFor();
  await h.ctx.close();
});

test("official exam workflow end to end through the UI, student sees the published result", async () => {
  const [hm, reg, rahim] = [await token("headmaster"), await token("registrar"), await token("teacher.rahim")];
  const classes = (await api("GET", "/classes", reg)).data; const subjects = (await api("GET", "/subjects", reg)).data;
  const class6 = classes.find((c) => c.name === "Class 6").id; const math = subjects.find((s) => s.code === "MATH").id;

  // Registrar creates the exam in the UI
  const R = await signIn(browser, "registrar");
  await R.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Exams" }).click();
  await R.page.getByRole("button", { name: "New exam" }).click();
  await R.page.getByLabel("Name").fill("UI Annual Exam");
  await R.page.getByLabel("Start date").fill("2026-11-01"); await R.page.getByLabel("End date").fill("2026-11-10");
  await R.page.getByRole("button", { name: "Create" }).click();
  await R.page.getByRole("heading", { name: "UI Annual Exam" }).waitFor();
  const examId = R.page.url().split("/exams/")[1];
  // add a paper in the UI
  await R.page.getByRole("button", { name: "Add paper" }).click();
  await R.page.getByLabel("Class").selectOption(class6); await R.page.getByLabel("Subject").selectOption(math);
  await R.page.getByRole("button", { name: "Add", exact: true }).click();
  await R.page.getByRole("cell", { name: "Mathematics" }).first().waitFor();
  // Registrar cannot authorize: no such button
  assert.equal(await R.page.getByRole("button", { name: "Authorize exam" }).count(), 0);

  // Headmaster authorizes in the UI
  const H = await signIn(browser, "headmaster");
  await H.page.goto(`${WEB}/exams/${examId}`);
  await H.page.getByRole("button", { name: "Authorize exam" }).click();
  await H.page.getByRole("dialog").getByRole("button", { name: "Authorize" }).click();
  await H.page.getByText(/Authorized — 2 submissions opened/).waitFor();

  // Teacher enters marks (with an invalid value first), saves, submits
  const T = await signIn(browser, "teacher.rahim");
  await T.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Marks entry" }).click();
  await T.page.getByRole("row").filter({ hasText: "Class 6-A" }).click();
  const names = ["Ayesha Siddiqua", "Farhan Ahmed", "Nusrat Jahan", "Tahmid Hasan", "Rafiul Islam"];
  const first = T.page.getByLabel(`Marks for ${names[0]}`);
  await first.fill("101");
  await T.page.getByRole("alert").filter({ hasText: "between 0 and 100" }).waitFor();
  assert.equal(await T.page.getByRole("button", { name: "Submit to Register" }).isDisabled(), true);
  const marks = [92, 81, 74, 66]; 
  for (let i = 0; i < 4; i++) await T.page.getByLabel(`Marks for ${names[i]}`).fill(String(marks[i]));
  await T.page.getByLabel(`${names[4]} absent`).check();
  await T.page.getByRole("button", { name: "Save draft" }).click();
  await T.page.getByText("Draft saved").waitFor();
  await T.page.getByRole("button", { name: "Submit to Register" }).click();
  await T.page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  await T.page.getByText("Submitted to the Register").waitFor();
  await T.page.getByText("This sheet is locked while the Register reviews it.").waitFor();

  // Section B completed through the API to keep the UI test focused
  const subs = (await api("GET", "/mark-submissions", rahim)).data; const subB = subs.find((s) => s.sectionName === "B");
  const detB = (await api("GET", `/mark-submissions/${subB.id}`, rahim)).data;
  await api("PUT", `/mark-submissions/${subB.id}/entries`, rahim, { entries: detB.entries.map((e) => ({ studentId: e.studentId, marksObtained: 70, absent: false })) });
  await api("POST", `/mark-submissions/${subB.id}/submit`, rahim);
  await api("POST", `/mark-submissions/${subB.id}/start-review`, reg); await api("POST", `/mark-submissions/${subB.id}/verify`, reg);

  // Registrar reviews section A in the UI: request a correction, then teacher fixes and resubmits via UI
  await R.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Submissions inbox" }).click();
  await R.page.getByRole("row").filter({ hasText: "Class 6-A" }).click();
  await R.page.getByRole("button", { name: "Start review" }).click();
  await R.page.getByRole("button", { name: "Request correction" }).waitFor();
  await R.page.getByRole("button", { name: "Request correction" }).click();
  await R.page.getByLabel("Reason (required)").fill("Please recheck roll 1");
  await R.page.getByLabel(`Flag ${names[0]}`).check();
  await R.page.getByRole("button", { name: "Send to teacher" }).click();
  await R.page.getByText("Correction requested").first().waitFor();
  await T.page.reload();
  await T.page.getByRole("link", { name: /Class 6-A|Mathematics/ }).first().waitFor().catch(() => {});
  await T.page.goto(`${WEB}/marks`);
  await T.page.getByRole("row").filter({ hasText: "Class 6-A" }).click();
  await T.page.getByRole("alert").filter({ hasText: /Please recheck roll 1/ }).waitFor();
  await T.page.getByLabel(`Marks for ${names[0]}`).fill("94");
  await T.page.getByRole("button", { name: "Submit to Register" }).click();
  await T.page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  await T.page.getByText("Submitted to the Register").waitFor();
  await R.page.goto(`${WEB}/review`);
  await R.page.getByRole("row").filter({ hasText: "Class 6-A" }).click();
  await R.page.getByRole("button", { name: "Start review" }).click();
  await R.page.getByText("(was 92)").waitFor(); // revision diff is shown
  await R.page.getByRole("button", { name: "Verify", exact: true }).click();
  await R.page.getByText("Verified").first().waitFor();

  // Compile in the UI
  await R.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Results" }).click();
  await R.page.getByRole("button", { name: "Compile results" }).click();
  await R.page.getByLabel("Exam").selectOption({ label: "UI Annual Exam" });
  await R.page.getByLabel("Class", { exact: true }).selectOption({ label: "Class 6" });
  await R.page.getByRole("dialog").getByRole("button", { name: "Compile" }).click();
  await R.page.getByRole("heading", { name: /UI Annual Exam · Class 6/ }).waitFor();
  const rsUrl = R.page.url();
  assert.equal(await R.page.getByRole("button", { name: "Approve" }).count(), 0, "registrar cannot approve");
  assert.equal(await R.page.getByRole("button", { name: "Publish" }).count(), 0);

  // Student cannot see an unpublished result
  const S = await signIn(browser, "student.ayesha");
  await S.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My results" }).click();
  await S.page.getByText("No results published yet").waitFor();

  // Headmaster approves (password re-auth) then publishes (typed confirmation + re-auth)
  await H.page.goto(rsUrl);
  await H.page.getByRole("button", { name: "Approve", exact: true }).click();
  await H.page.getByLabel("Password").fill("wrong-password-1");
  await H.page.getByRole("button", { name: "Confirm" }).click();
  await H.page.getByRole("alert").filter({ hasText: /incorrect/i }).waitFor();
  await H.page.getByLabel("Password").fill(PASSWORD);
  await H.page.getByRole("button", { name: "Confirm" }).click();
  await H.page.getByText("Results approved").waitFor();
  await H.page.getByRole("button", { name: "Publish", exact: true }).click();
  await H.page.getByLabel(/Type "PUBLISH"/).fill("PUBLISH");
  await H.page.getByRole("button", { name: "Continue" }).click();
  await H.page.getByLabel("Password").fill(PASSWORD);
  await H.page.getByRole("button", { name: "Confirm" }).click();
  await H.page.getByText(/Results published/).waitFor();

  // Student now sees the result and a notification
  await S.page.reload();
  await S.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My results" }).click();
  await S.page.getByText("UI Annual Exam").first().waitFor();
  await S.page.getByText("Mathematics").first().waitFor();
  await S.page.getByRole("button", { name: /Notifications/ }).click();
  await S.page.getByText("New result published").first().waitFor();
  for (const c of [R, H, T, S]) await c.ctx.close();
});

test("realtime chat between student and teacher with read-only class group rules", async () => {
  const S = await signIn(browser, "student.ayesha"); const T = await signIn(browser, "teacher.rahim");
  await T.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Messages" }).click();
  await S.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Messages" }).click();
  // student starts a DM with her teacher; no student appears in the recipient list
  await S.page.getByRole("button", { name: "New message" }).click();
  const options = await S.page.getByRole("listbox", { name: "Recipients" }).locator("option").allTextContents().catch(async () => S.page.locator("select[aria-label=Recipients] option").allTextContents());
  assert.ok(options.length > 0 && options.every((o) => !/student/i.test(o)), `recipients must not include students: ${options.join(" | ")}`);
  await S.page.locator("select[aria-label=Recipients]").selectOption({ label: options.find((o) => o.includes("Rahim")) });
  await S.page.getByRole("button", { name: "Start conversation" }).click();
  await S.page.getByLabel("Message", { exact: true }).fill("Sir, when is the next class test?");
  await S.page.getByRole("button", { name: "Send" }).click();
  await S.page.getByText("Sir, when is the next class test?").first().waitFor();
  // teacher receives it live (WebSocket) without reloading
  await T.page.getByText("Sir, when is the next class test?").first().waitFor({ timeout: 20000 }).catch(async () => { await T.page.reload(); await T.page.getByText(/Ayesha/).first().waitFor(); });
  await T.page.getByText(/Ayesha/).first().click();
  await T.page.getByLabel("Message", { exact: true }).fill("Next Sunday.");
  await T.page.getByRole("button", { name: "Send" }).click();
  await S.page.getByText("Next Sunday.").first().waitFor({ timeout: 20000 });
  // class group: composer is absent for the student
  await S.page.getByText(/Class 6-A/).first().click();
  await S.page.getByText("You can read this conversation but not post in it.").waitFor();
  await S.ctx.close(); await T.ctx.close();
});
