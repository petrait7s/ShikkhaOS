// Short 5-page proposal. Usage: PW_EXECUTABLE=... node docs/proposal/build-short.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(path.join(dir, "shots")).filter((f) => f.endsWith(".jpg"));
const sizes = JSON.parse(readFileSync(path.join(dir, "shots", "sizes.json"), "utf8"));
const b64 = (f, m) => `data:${m};base64,${readFileSync(f).toString("base64")}`;
const find = (k) => { const f = files.find((x) => x.includes(`-${k}.jpg`)); if (!f) throw new Error(k); return f; };
const img = (k) => b64(path.join(dir, "shots", find(k)), "image/jpeg");
const LOGO = b64(path.join(dir, "logo-mark.png"), "image/png"), TILE = b64(path.join(dir, "logo-tile.jpg"), "image/jpeg");
// framed screenshot, cropped to content height (px of a 1440-wide capture)
const shot = (k, cap, h) => { const s = sizes[find(k)]; const px = Math.min(s.h, Math.round(h ? h * 1.5 : s.content + 40)); return `<figure class="shot"><div class="bar"><i></i><i></i><i></i></div><div class="win" style="aspect-ratio:${s.w}/${px}"><img src="${img(k)}" alt=""></div><figcaption>${cap}</figcaption></figure>`; };
const phone = (k, cap) => `<figure class="phone"><div class="scr"><img src="${img(k)}" alt=""></div><figcaption>${cap}</figcaption></figure>`;
const ico = { web: '<path d="M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z"/>', phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>' };
const svg = (k, c) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ico[k]}</svg>`;
const contact = (c1, c2) => [["web", "petrait.site", "https://petrait.site"], ["phone", "016-16154320", "tel:+8801616154320"], ["mail", "petraitbd@gmail.com", "mailto:petraitbd@gmail.com"]].map(([k, t, h]) => `<a href="${h}" class="ct" style="color:${c2}">${svg(k, c1)}<span>${t}</span></a>`).join("");
let n = 0;
const page = (body, cls = "") => { n++; return `<section class="page ${cls}">${cls === "cover" ? "" : `<header><span class="br"><img src="${LOGO}" alt=""><b>ShikkhaOS</b></span><span>Project proposal</span></header>`}${body}${cls === "cover" ? "" : `<footer><span>petrait.site</span><span>${n}</span></footer>`}</section>`; };

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ShikkhaOS — Proposal</title><style>
:root{--navy:#0F172A;--teal:#14B8A6;--ink2:#0F766E;--mint:#DCEFEB;--pearl:#F7F9FC;--muted:#475569;--line:#D6E3E1}
*{box-sizing:border-box}html{background:#E4ECEB}body{margin:0;font:10pt/1.5 Inter,"Segoe UI",system-ui,sans-serif;color:var(--navy);-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4;margin:0}.page{width:210mm;height:297mm;margin:10mm auto;background:var(--pearl);position:relative;overflow:hidden;padding:22mm 18mm 18mm;display:flex;flex-direction:column;break-after:page}
@media screen{.page{box-shadow:0 8px 30px rgba(15,23,42,.18)}}@media print{html{background:none}.page{margin:0}}
.page:not(.cover)::before{content:"";position:absolute;left:0;top:0;width:100%;height:1.6mm;background:linear-gradient(90deg,var(--navy) 0 70%,var(--teal) 70%)}
header{position:absolute;top:9mm;left:18mm;right:18mm;display:flex;justify-content:space-between;font-size:8pt;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:2mm}.br{display:flex;align-items:center;gap:2mm;color:var(--navy)}.br img{height:4.6mm}
footer{position:absolute;bottom:8mm;left:18mm;right:18mm;display:flex;justify-content:space-between;font-size:8pt;color:var(--muted)}
.k{font-size:8pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);margin-bottom:2mm}.k::before{content:"";display:inline-block;width:6mm;height:.7mm;background:var(--teal);vertical-align:middle;margin-right:2mm}
h1{font-size:24pt;line-height:1.12;margin:0 0 3mm;letter-spacing:-.02em}h3{font-size:10.5pt;margin:0 0 1mm}p{margin:0 0 3mm}.lead{font-size:11.5pt;color:var(--muted);max-width:150mm;margin-bottom:7mm}.m{color:var(--muted)}.s{font-size:9pt}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:5mm;align-items:start}.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;align-items:start}.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm}
.card{background:#fff;border:1px solid var(--line);border-radius:3.5mm;padding:4mm}.card.mint{background:var(--mint);border-color:transparent}.card.navy{background:var(--navy);color:#fff;border-color:transparent}.card.navy .m{color:#B8C4D6}
.num{font-size:22pt;font-weight:800;color:var(--ink2);line-height:1}
.shot{margin:0;background:#fff;border:1px solid var(--line);border-radius:3mm;overflow:hidden}.bar{display:flex;gap:1.4mm;padding:2mm 3mm;background:var(--navy)}.bar i{width:2mm;height:2mm;border-radius:50%;background:var(--teal)}.bar i:nth-child(2){background:var(--mint)}.bar i:nth-child(3){background:#fff;opacity:.5}
.win{overflow:hidden}.win img{display:block;width:100%}figcaption{font-size:8pt;color:var(--muted);padding:2mm 3mm;border-top:1px solid var(--line);background:#fff}
.phone{margin:0 auto;width:48mm}.scr{background:var(--navy);border-radius:7mm;padding:2mm}.scr img{display:block;width:100%;border-radius:5.2mm;aspect-ratio:390/760;object-fit:cover;object-position:top}.phone figcaption{border:0;background:none;text-align:center}
.step{background:#fff;border:1px solid var(--line);border-radius:3mm;padding:3mm 3mm 3mm 11mm;position:relative}.step::before{content:attr(data-n);position:absolute;left:3mm;top:3mm;width:6mm;height:6mm;border-radius:50%;background:var(--teal);color:var(--navy);font-weight:800;font-size:9pt;display:grid;place-items:center}.step.gate{background:var(--navy);color:#fff;border-color:var(--navy)}.step b{display:block;font-size:9.5pt}.step span{font-size:8.5pt;color:var(--muted)}.step.gate span{color:#B8C4D6}
ul.c{list-style:none;padding:0;margin:0}ul.c li{position:relative;padding-left:5.5mm;margin-bottom:1.6mm}ul.c li::before{content:"✓";position:absolute;left:0;color:var(--ink2);font-weight:800}.navy ul.c li::before{color:var(--teal)}
.cover{background:var(--navy);color:#fff;padding:0}.cover .in{position:relative;height:100%;padding:26mm 20mm 20mm;display:flex;flex-direction:column}.glow{position:absolute;width:190mm;height:190mm;right:-70mm;top:-60mm;background:radial-gradient(circle,rgba(20,184,166,.5),rgba(20,184,166,0) 65%)}
.cover .tile{width:20mm;height:20mm;border-radius:4.6mm}.cover h1{font-size:50pt;letter-spacing:-.03em;margin:0 0 5mm}.rule{width:18mm;height:1.2mm;background:var(--teal);margin-bottom:6mm}.cover .tag{font-size:14pt;color:var(--mint);max-width:125mm}
.ct{display:inline-flex;align-items:center;gap:2.4mm;text-decoration:none;font-size:9.5pt;margin-right:8mm}.ct svg{flex:none}
.pay{display:grid;grid-template-columns:3fr 3fr 4fr;gap:4mm}.pay .card .num{font-size:26pt;color:var(--teal)}.pay .card.navy b{display:block;margin-top:2mm}
</style></head><body>

${page(`<div class="glow"></div><div class="in"><img class="tile" src="${TILE}" alt="ShikkhaOS"><div style="margin:auto 0 0"><div class="rule"></div><h1>ShikkhaOS</h1><div style="font-size:30pt;font-weight:700;letter-spacing:-.02em;line-height:1.1;margin-bottom:6mm">One school.<br>One system.</div><div class="tag">Project proposal for the School Managing Committee</div></div><div style="margin-top:auto;border-top:1px solid rgba(220,239,235,.3);padding-top:6mm;display:flex;justify-content:space-between;align-items:center;font-size:9.5pt;color:#C7D6E8"><span>November 2026</span><span>${contact("#5EEAD4", "#E6EEF7")}</span></div></div>`, "cover")}

${page(`<div class="k">Overview</div><h1>One connected school system</h1><p class="lead">Marks, attendance, notices and messages in one secure place. Each person sees only what their role allows.</p>
  <div class="g3" style="margin-bottom:6mm"><div class="card"><h3>Desktop</h3><p class="s m" style="margin:0">Windows app for staff</p></div><div class="card"><h3>Web</h3><p class="s m" style="margin:0">Any browser, all roles</p></div><div class="card"><h3>Android</h3><p class="s m" style="margin:0">Student app</p></div></div>
  ${shot("headmaster-dashboard", "Headmaster dashboard", 900)}
  <div class="g4" style="margin-top:6mm"><div class="card"><h3>Headmaster</h3><p class="s m" style="margin:0">Approves and publishes results</p></div><div class="card"><h3>Register</h3><p class="s m" style="margin:0">Prepares exams, verifies marks</p></div><div class="card"><h3>Teacher</h3><p class="s m" style="margin:0">Attendance, marks, homework</p></div><div class="card"><h3>Student</h3><p class="s m" style="margin:0">Own results and notices</p></div></div>`)}

${page(`<div class="k">Results</div><h1>From marks to published result</h1><p class="lead">Every step has an owner and a record. Nothing changes quietly.</p>
  <div class="g3" style="margin-bottom:6mm"><div class="step" data-n="1"><b>Create exam</b><span>Register</span></div><div class="step gate" data-n="2"><b>Authorize</b><span>Headmaster</span></div><div class="step" data-n="3"><b>Enter marks</b><span>Teacher</span></div><div class="step" data-n="4"><b>Submit</b><span>Marks are locked</span></div><div class="step" data-n="5"><b>Review</b><span>Register</span></div><div class="step" data-n="6"><b>Verify</b><span>Register</span></div><div class="step gate" data-n="7"><b>Approve</b><span>Headmaster</span></div><div class="step gate" data-n="8"><b>Publish</b><span>Headmaster</span></div><div class="step" data-n="9"><b>Notify</b><span>Students</span></div></div>
  <div style="display:grid;gap:5mm">${shot("review-inbox", "Register: submissions inbox", 300)}${shot("results-approval", "Headmaster: approval before publishing", 420)}</div>
  <div class="g2" style="margin-top:6mm"><div class="card mint"><h3>Corrections</h3><p class="s" style="margin:0">The Register requests a fix with a reason. The teacher resubmits as a new revision.</p></div><div class="card mint"><h3>Published means final</h3><p class="s" style="margin:0">Changes need a new approved revision. The old one stays on record.</p></div></div>`)}

${page(`<div class="k">Students and safety</div><h1>Safe by design</h1><p class="lead">Student access is limited and every important action is recorded.</p>
  <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:5mm;align-items:start;margin-bottom:6mm"><div>${shot("student-result", "Student: own result", 640)}</div><div>${phone("phone-result", "Result on a phone")}</div></div>
  <div class="g2"><div class="card navy"><h3>Protection</h3><ul class="c s"><li>Role-based access, enforced by the server</li><li>Password re-entry to approve or publish</li><li>Published results cannot be altered</li><li>Complete audit log of changes</li></ul></div><div class="card"><h3>Messaging</h3><ul class="c s"><li>No private chat between students</li><li>Students message their own teachers only</li><li>Reports and moderation by the Headmaster</li><li>Notices to a class, role or the whole school</li></ul></div></div>
  <div style="margin-top:5mm">${shot("audit-log", "Audit log: permanent record of who did what", 360)}</div>`)}

${page(`<div class="k">Plan</div><h1>Start with one class</h1><p class="lead">A pilot lets the school judge ShikkhaOS on real work before expanding.</p>
  <div class="g3" style="margin-bottom:6mm"><div class="card"><div class="num">1</div><h3 style="margin-top:2mm">Prepare</h3><p class="s m" style="margin:0">Server, accounts, student import</p></div><div class="card"><div class="num">2</div><h3 style="margin-top:2mm">Pilot</h3><p class="s m" style="margin:0">One class, one term, weekly review</p></div><div class="card"><div class="num">3</div><h3 style="margin-top:2mm">Whole school</h3><p class="s m" style="margin:0">All classes and the student app</p></div></div>
  <div class="k" style="margin-top:2mm">Payment on the contract</div>
  <div class="pay" style="margin-bottom:8mm"><div class="card navy"><div class="num">30%</div><b>On signing</b><span class="s m">Work begins</span></div><div class="card navy"><div class="num">30%</div><b>At pilot go-live</b><span class="s m">Pilot class running</span></div><div class="card navy" style="background:#0B3B3A"><div class="num">40%</div><b>On handover</b><span class="s m">Whole school live</span></div></div>
  <div class="k">Decisions requested</div>
  <ul class="c" style="margin-bottom:8mm"><li>Approve the pilot class</li><li>Choose where the system runs: cloud or school server</li><li>Confirm who may publish results</li><li>Nominate a system owner</li></ul>
  <div style="margin-top:auto;border-top:1px solid var(--line);padding-top:6mm;display:flex;justify-content:space-between;align-items:center"><span style="display:flex;align-items:center;gap:3mm"><img src="${LOGO}" style="height:9mm" alt=""><b>ShikkhaOS</b></span><span>${contact("#0F766E", "#0F172A")}</span></div>`)}
</body></html>`;
writeFileSync(path.join(dir, "short.html"), html);
const { chromium } = await import("playwright");
const b = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.goto("file://" + path.join(dir, "short.html")); await p.waitForTimeout(800);
await p.pdf({ path: path.join(dir, "ShikkhaOS-Proposal-Short.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
await b.close(); console.log("pages", n);
