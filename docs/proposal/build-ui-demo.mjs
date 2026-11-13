// Clickable gallery of real app screens. Usage: node docs/proposal/build-ui-demo.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const sizes = JSON.parse(readFileSync(path.join(dir, "shots", "sizes.json"), "utf8"));
const groups = [
  ["Sign in", [["01-login", "Login"]]],
  ["Headmaster", [["02-headmaster-dashboard", "Dashboard"], ["06-exams-list", "Exams"], ["05-exam-progress", "Exam progress"], ["03-results-list", "Results"], ["04-results-approval", "Result approval"], ["07-reports-chart", "Reports"], ["08-permissions", "Permissions"], ["09-audit-log", "Audit log"], ["10-settings-policies", "School settings"], ["24-notices", "Notices"], ["23-messages-chat", "Messages"]]],
  ["Register", [["11-students-registry", "Students"], ["12-review-inbox", "Submissions inbox"], ["13-review-detail", "Review submission"]]],
  ["Teacher", [["19-teacher-dashboard-correction", "Dashboard"], ["16-attendance-roll-call", "Attendance"], ["14-marks-list", "My marks"], ["15-marks-entry-grid", "Marks entry"], ["20-correction-requested", "Correction requested"], ["17-class-tests", "Class tests"], ["18-homework-teacher", "Homework"]]],
  ["Student", [["21-student-dashboard", "Dashboard"], ["22-student-result", "My results"]]],
  ["Phone", [["25-phone-dashboard", "Dashboard"], ["26-phone-result", "Result"], ["27-phone-attendance", "Attendance"], ["28-phone-menu", "Menu"]]],
];
const data = groups.map(([g, items]) => ({ g, items: items.map(([f, t]) => ({ t, phone: g === "Phone", src: `data:image/jpeg;base64,${readFileSync(path.join(dir, "shots", f + ".jpg")).toString("base64")}`, h: sizes[f + ".jpg"]?.content ?? null, w: sizes[f + ".jpg"]?.w ?? null })) }));
let k = 0;
const menu = data.map((g) => `<h2>${g.g}</h2>` + g.items.map((i) => `<a href="#s${i.id = k++}">${i.t}</a>`).join("")).join("");
const body = data.map((g) => g.items.map((i) => `<section id="s${i.id}"><div class="top"><h2>${i.t}</h2><small>${g.g}</small></div><div class="frame${i.phone ? " phone" : ""}"><div class="bar"><i></i><i></i><i></i></div><img src="${i.src}" alt="${g.g} — ${i.t}"></div></section>`).join("")).join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShikkhaOS — Interface demo</title><style>
:root{--navy:#0F172A;--teal:#14B8A6;--mint:#DCEFEB;--pearl:#F7F9FC;--muted:#475569;--line:#D6E3E1}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:14px/1.45 Inter,"Segoe UI",system-ui,sans-serif;background:var(--pearl);color:var(--navy);display:grid;grid-template-columns:230px 1fr}
aside{background:var(--navy);color:#fff;padding:16px 10px;position:sticky;top:0;height:100vh;overflow:auto}aside h1{font-size:15px;margin:0 8px 14px}
aside h2{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);margin:14px 8px 4px}aside a{display:block;color:#C7D6E8;text-decoration:none;padding:7px 10px;border-radius:8px}aside a:hover,aside a:focus{background:var(--teal);color:var(--navy)}
main{padding:20px 28px;min-width:0}section{margin-bottom:44px;scroll-margin-top:16px}.top{display:flex;align-items:baseline;gap:12px;margin-bottom:10px}.top h2{margin:0;font-size:20px}.top small{color:var(--muted)}
.frame{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;max-width:1400px}.bar{display:flex;gap:6px;padding:9px 12px;background:var(--navy)}.bar i{width:9px;height:9px;border-radius:50%;background:var(--teal)}.bar i:nth-child(2){background:var(--mint)}.bar i:nth-child(3){background:#fff;opacity:.5}
.frame img{display:block;width:100%;height:auto}.frame.phone{max-width:380px;margin:0;border-radius:34px;background:var(--navy);padding:10px;border:0}.frame.phone img{border-radius:26px}.frame.phone .bar{display:none}
@media(max-width:800px){body{display:block}aside{position:static;height:auto;display:flex;flex-wrap:wrap;gap:4px}aside h2{width:100%;margin:8px 4px 2px}aside a{padding:6px 10px;background:#1B2742}main{padding:14px}}
</style></head><body><aside><h1>ShikkhaOS · screens</h1>${menu}</aside><main>${body}</main></body></html>`;
writeFileSync(path.join(dir, "ui-demo.html"), html);
console.log((html.length / 1e6).toFixed(1) + " MB");
