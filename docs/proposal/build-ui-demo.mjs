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
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShikkhaOS — Interface demo</title><style>
:root{--navy:#0F172A;--teal:#14B8A6;--ink2:#0F766E;--mint:#DCEFEB;--pearl:#F7F9FC;--muted:#475569;--line:#D6E3E1}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 Inter,"Segoe UI",system-ui,sans-serif;background:var(--pearl);color:var(--navy);display:grid;grid-template-columns:250px 1fr;min-height:100vh}
aside{background:var(--navy);color:#fff;padding:18px 12px;position:sticky;top:0;height:100vh;overflow:auto}aside h1{font-size:15px;margin:0 8px 2px}aside .sub{font-size:11px;color:#9FB1C9;margin:0 8px 14px}
aside h2{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);margin:14px 8px 4px}aside button{display:block;width:100%;text-align:left;background:none;border:0;color:#C7D6E8;padding:7px 10px;border-radius:8px;font:inherit;cursor:pointer}aside button:hover{background:#1B2742}aside button.on{background:var(--teal);color:var(--navy);font-weight:700}
main{padding:20px 28px;min-width:0}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px;flex-wrap:wrap}.top h2{margin:0;font-size:20px}.top small{color:var(--muted)}
.nav button{background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit}.nav button:hover{border-color:var(--teal)}
.frame{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;max-width:1400px}.bar{display:flex;gap:6px;padding:9px 12px;background:var(--navy)}.bar i{width:9px;height:9px;border-radius:50%;background:var(--teal)}.bar i:nth-child(2){background:var(--mint)}.bar i:nth-child(3){background:#fff;opacity:.5}
.frame img{display:block;width:100%}.frame.phone{max-width:380px;margin:0 auto;border-radius:34px;background:var(--navy);padding:10px;border:0}.frame.phone img{border-radius:26px}.frame.phone .bar{display:none}
.hint{margin-top:10px;color:var(--muted);font-size:12px}
@media(max-width:800px){body{grid-template-columns:1fr}aside{position:static;height:auto;display:flex;flex-wrap:wrap;gap:4px}aside h2{width:100%}aside button{width:auto}}
</style></head><body><aside><h1>ShikkhaOS</h1><div class="sub">Interface demo · real screens</div><div id="menu"></div></aside>
<main><div class="top"><div><h2 id="title"></h2><small id="role"></small></div><div class="nav"><button id="prev">← Previous</button> <button id="next">Next →</button></div></div><div id="frame" class="frame"><div class="bar"><i></i><i></i><i></i></div><img id="img" alt=""></div><div class="hint">Use ← → keys or the menu. Screens show demo data.</div></main>
<script>
const D=${JSON.stringify(data)};const flat=[];D.forEach(g=>g.items.forEach(i=>flat.push({...i,g:g.g})));let cur=0;
const menu=document.getElementById("menu");let idx=0;
D.forEach(g=>{const h=document.createElement("h2");h.textContent=g.g;menu.appendChild(h);g.items.forEach(i=>{const k=idx++;const b=document.createElement("button");b.textContent=i.t;b.onclick=()=>show(k);b.dataset.k=k;menu.appendChild(b)})});
function show(k){cur=(k+flat.length)%flat.length;const f=flat[cur];document.getElementById("img").src=f.src;document.getElementById("title").textContent=f.t;document.getElementById("role").textContent=f.g;document.getElementById("frame").className="frame"+(f.phone?" phone":"");document.querySelectorAll("aside button").forEach(b=>b.classList.toggle("on",+b.dataset.k===cur));scrollTo(0,0)}
document.getElementById("prev").onclick=()=>show(cur-1);document.getElementById("next").onclick=()=>show(cur+1);
addEventListener("keydown",e=>{if(e.key==="ArrowRight")show(cur+1);if(e.key==="ArrowLeft")show(cur-1)});show(1);
</script></body></html>`;
writeFileSync(path.join(dir, "ui-demo.html"), html);
console.log((html.length / 1e6).toFixed(1) + " MB");
