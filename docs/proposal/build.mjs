// Builds the committee proposal: index.html (self-contained preview) and ShikkhaOS-Proposal.pdf (via Chromium).
// Screenshots come from e2e/proposal/capture.mjs (real UI, invented demo data). Usage: node docs/proposal/build.mjs [--pdf]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(path.join(dir, "shots")).filter((f) => f.endsWith(".jpg"));
const find = (key) => { const f = files.find((x) => x.includes(`-${key}.jpg`)); if (!f) throw new Error(`missing screenshot: ${key}`); return f; };
const inline = process.argv.includes("--inline") || process.argv.includes("--pdf");
const src = (f) => (inline ? `data:image/jpeg;base64,${readFileSync(path.join(dir, "shots", f)).toString("base64")}` : `shots/${f}`);

// Screens are cropped to the working area (no sidebar/tab strip) so text stays readable at page size; "full" keeps the whole window.
const sizes = JSON.parse(readFileSync(path.join(dir, "shots", "sizes.json"), "utf8"));
const shot = (key, caption, opt = {}) => {
  const o = typeof opt === "string" ? { cls: opt } : opt;
  const f = find(key); const m = sizes[f]; const w = o.w ?? 1208;                      // visible width of the working area (px at 1x)
  const h = Math.min(m ? m.content : 700, 780);                                          // visible content height
  const style = `aspect-ratio:${(w / h).toFixed(3)}`, img = `width:${(1440 / w * 100).toFixed(1)}%;margin-left:-${(232 / w * 100).toFixed(1)}%;margin-top:-${(80 / w * 100).toFixed(1)}%`;
  return `<figure class="shot focus ${o.cls ?? ""}" style="${o.style ?? ""}"><div class="chrome"><i></i><i></i><i></i></div><div class="win" style="${style}"><img style="${img}" src="${src(f)}" alt="${caption}"></div><figcaption>${caption}</figcaption></figure>`;
};
const phone = (key, caption) => `<figure class="phone"><div class="screen"><img src="${src(find(key))}" alt="${caption}"></div><figcaption>${caption}</figcaption></figure>`;
let pageNo = 0;
const page = (cls, body, { head = true } = {}) => { pageNo++; return `<section class="page ${cls}">${head ? `<header class="run"><span class="brand"><img src="${LOGO}" alt=""><b>ShikkhaOS</b> · Project proposal</span><span>School Managing Committee</span></header>` : ""}${body}<footer class="foot"><span>One School. One System. One Connected Community. · <a href="https://petrait.site" style="color:inherit">petrait.site</a></span><span>${pageNo}</span></footer></section>`; };
const b64 = (f, mime) => `data:${mime};base64,${readFileSync(path.join(dir, f)).toString("base64")}`;
const LOGO = b64("logo-mark.png", "image/png"), LOGO_LIGHT = b64("logo-mark-light.png", "image/png"), TILE = b64("logo-tile.jpg", "image/jpeg");
const ico = { web: '<path d="M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z"/>', phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>' };
const svg = (k) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#5EEAD4" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${ico[k]}</svg>`;
const contactItems = [["web", "https://petrait.site", "petrait.site"], ["phone", "tel:+8801616154320", "016-16154320"], ["mail", "mailto:petraitbd@gmail.com", "petraitbd@gmail.com"]];
const contact = (dir) => `<div style="display:flex;flex-direction:${dir};gap:${dir === "row" ? "9mm" : "3mm"}">${contactItems.map(([k, h, t]) => `<a href="${h}" style="display:flex;align-items:center;gap:2.4mm;color:#E6EEF7;text-decoration:none;font-size:${dir === "row" ? "9.5pt" : "11pt"}">${svg(k)}<span>${t}</span></a>`).join("")}</div>`;
const icon = (n) => ({ headmaster: "★", registrar: "✎", teacher: "✐", student: "☺", check: "✓", lock: "🔒" }[n] ?? "•");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ShikkhaOS — Project Proposal</title>
<style>
:root { --navy: #0F172A; --navy-2: #1B2742; --teal: #14B8A6; --teal-ink: #0F766E; --mint: #DCEFEB; --pearl: #F7F9FC; --ink: #0F172A; --muted: #475569; --line: #D6E3E1; --warn: #B45309; }
* { box-sizing: border-box; }
html { background: #E4ECEB; }
body { margin: 0; font: 10.5pt/1.5 Inter, "Segoe UI", system-ui, sans-serif; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4; margin: 0; }
.page { width: 210mm; height: 297mm; margin: 12mm auto; background: var(--pearl); position: relative; overflow: hidden; padding: 20mm 16mm 16mm; page-break-after: always; break-after: page; display: flex; flex-direction: column; }
@media screen { .page { box-shadow: 0 8px 30px rgba(15, 23, 42, .18); } }
@media print { html { background: none; } .page { margin: 0; box-shadow: none; } }
.run { position: absolute; top: 8mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; font-size: 8pt; color: var(--muted); border-bottom: 1px solid var(--line); padding-bottom: 2mm; }
.foot { position: absolute; bottom: 7mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; font-size: 8pt; color: var(--muted); }
h1 { font-size: 26pt; line-height: 1.1; margin: 0 0 4mm; letter-spacing: -.02em; }
h2 { font-size: 17pt; margin: 0 0 2mm; letter-spacing: -.01em; } h3 { font-size: 11.5pt; margin: 0 0 1mm; }
.kicker { text-transform: uppercase; letter-spacing: .12em; font-size: 8pt; font-weight: 700; color: var(--teal-ink); margin-bottom: 2mm; }
.lead { font-size: 12pt; color: var(--muted); margin: 0 0 6mm; max-width: 150mm; }
p { margin: 0 0 3mm; } ul { margin: 0 0 3mm; padding-left: 5mm; } li { margin-bottom: 1.2mm; }
.muted { color: var(--muted); }
.cols { display: grid; gap: 6mm; align-items: start; } .c2 { grid-template-columns: 1fr 1fr; } .c3 { grid-template-columns: repeat(3, 1fr); } .c4 { grid-template-columns: repeat(4, 1fr); } .c-7-5 { grid-template-columns: 1.4fr 1fr; } .c-5-7 { grid-template-columns: 1fr 1.4fr; }
.card { background: #fff; border: 1px solid var(--line); border-radius: 4mm; padding: 4.5mm; } .card.mint { background: var(--mint); border-color: transparent; } .card.navy { background: var(--navy); color: #fff; border-color: transparent; } .card.navy .muted { color: #B8C4D6; }
.stat { text-align: center; } .stat b { display: block; font-size: 24pt; color: var(--teal-ink); line-height: 1; letter-spacing: -.02em; } .stat span { font-size: 8.5pt; color: var(--muted); }
.pill { display: inline-block; padding: .6mm 3mm; border-radius: 99px; background: var(--mint); color: var(--teal-ink); font-size: 8.5pt; font-weight: 600; } .pill.warn { background: #FEF3C7; color: var(--warn); } .pill.navy { background: var(--navy); color: #fff; }
.cover { background: var(--navy); color: #fff; padding: 0; } .cover .run, .cover .foot { display: none; }
.cover .glow { position: absolute; width: 190mm; height: 190mm; right: -70mm; top: -60mm; background: radial-gradient(circle, rgba(20,184,166,.55) 0%, rgba(20,184,166,0) 65%); }
.cover .glow2 { position: absolute; width: 150mm; height: 150mm; left: -60mm; bottom: -50mm; background: radial-gradient(circle, rgba(220,239,235,.22) 0%, rgba(220,239,235,0) 65%); }
.cover .inner { position: relative; padding: 28mm 20mm 20mm; display: flex; flex-direction: column; height: 100%; }
.logo { display: flex; align-items: center; gap: 4mm; font-weight: 700; font-size: 15pt; } .logo i { width: 12mm; height: 12mm; border-radius: 3.5mm; background: var(--teal); display: grid; place-items: center; color: var(--navy); font-style: normal; font-weight: 800; font-size: 17pt; }
.cover h1 { font-size: 52pt; margin: auto 0 4mm; letter-spacing: -.03em; } .cover .tag { font-size: 15pt; color: var(--mint); max-width: 120mm; margin-bottom: 10mm; } .cover .meta { border-top: 1px solid rgba(220,239,235,.3); padding-top: 6mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; font-size: 9.5pt; color: #C7D6E8; } .cover .meta b { display: block; color: #fff; font-size: 10.5pt; }
table.t { width: 100%; border-collapse: collapse; font-size: 9.5pt; background: #fff; border-radius: 3mm; overflow: hidden; } table.t th { background: var(--navy); color: #fff; text-align: left; padding: 2.5mm 3mm; font-weight: 600; } table.t td { padding: 2.5mm 3mm; border-bottom: 1px solid var(--line); vertical-align: top; } table.t tr:nth-child(even) td { background: #F1F8F6; }
.shot { margin: 0; background: #fff; border: 1px solid var(--line); border-radius: 3mm; overflow: hidden;  } .shot .chrome { display: flex; gap: 1.4mm; padding: 2mm 3mm; background: var(--navy); } .shot .chrome i { width: 2mm; height: 2mm; border-radius: 50%; background: var(--teal); opacity: .8; } .shot .chrome i:nth-child(2) { background: var(--mint); } .shot .chrome i:nth-child(3) { background: #fff; opacity: .5; }
.shot img { display: block; width: 100%; height: auto; } .shot.focus .win { overflow: hidden; } .shot.focus img { max-width: none; } .shot figcaption, .phone figcaption { font-size: 8pt; color: var(--muted); padding: 2mm 3mm; background: #fff; border-top: 1px solid var(--line); } .shot.crop-top img { object-fit: cover; object-position: top; }
.phone { margin: 0 auto; width: 52mm; } .phone .screen { background: var(--navy); border-radius: 7mm; padding: 2mm;  } .phone img { display: block; width: 100%; border-radius: 5.2mm; aspect-ratio: 390 / 844; object-fit: cover; object-position: top; } .phone figcaption { background: none; border: 0; text-align: center; padding-top: 2mm; }
.flow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; counter-reset: step; } .step { background: #fff; border: 1px solid var(--line); border-radius: 3.5mm; padding: 3.5mm 4mm 3.5mm 13mm; position: relative; min-height: 22mm; } .step::before { counter-increment: step; content: counter(step); position: absolute; left: 3.5mm; top: 3.5mm; width: 7mm; height: 7mm; border-radius: 50%; background: var(--teal); color: var(--navy); font-weight: 800; display: grid; place-items: center; font-size: 10pt; } .step b { display: block; font-size: 9.5pt; } .step span { font-size: 8.5pt; color: var(--muted); } .step.gate { background: var(--navy); color: #fff; border-color: var(--navy); } .step.gate span { color: #B8C4D6; }
.arch { display: grid; grid-template-columns: 1fr; align-items: center; gap: 2mm; } .arch .node { background: #fff; border: 1.5px solid var(--teal); border-radius: 4mm; padding: 4mm; text-align: center; } .arch .node.big { background: var(--navy); color: #fff; border-color: var(--navy); } .arch .arrow { text-align: center; color: var(--teal-ink); font-size: 18pt; }
.role h3 { display: flex; align-items: center; gap: 2mm; } .role .ic { width: 7mm; height: 7mm; border-radius: 2mm; background: var(--navy); color: var(--teal); display: grid; place-items: center; font-size: 10pt; }
.check li { list-style: none; position: relative; padding-left: 6mm; } .check li::before { content: "✓"; position: absolute; left: 0; color: var(--teal-ink); font-weight: 800; } .cross li::before { content: "–"; color: var(--warn); }
.box { border-left: 1.2mm solid var(--teal); background: var(--mint); padding: 3.5mm 4.5mm; border-radius: 0 3mm 3mm 0; margin-bottom: 4mm; }
.timeline { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; } .phase { background: #fff; border-top: 1.4mm solid var(--teal); border-radius: 2mm 2mm 3mm 3mm; padding: 3.5mm; border-left: 1px solid var(--line); border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); } .phase .when { font-size: 8pt; font-weight: 700; color: var(--teal-ink); text-transform: uppercase; letter-spacing: .06em; }
.decide li { list-style: none; padding: 2.5mm 3mm 2.5mm 9mm; position: relative; background: #fff; border: 1px solid var(--line); border-radius: 2.5mm; margin-bottom: 2mm; } .decide li::before { content: ""; position: absolute; left: 3mm; top: 3.3mm; width: 3.5mm; height: 3.5mm; border: 1.5px solid var(--navy); border-radius: 1mm; }
.brand { display: flex; align-items: center; gap: 2mm; } .brand img { height: 4.6mm; width: auto; }
.run { border-bottom: 1px solid var(--line); } .page:not(.cover):not(.closing)::before { content: ""; position: absolute; left: 0; top: 0; width: 100%; height: 1.6mm; background: linear-gradient(90deg, var(--navy) 0 70%, var(--teal) 70%); }
.kicker::before { content: ""; display: inline-block; width: 6mm; height: .7mm; background: var(--teal); vertical-align: middle; margin-right: 2mm; }
.cover .tile { width: 22mm; height: 22mm; border-radius: 5mm; border: 1px solid rgba(255,255,255,.25); } .cover .brandname { font-size: 17pt; font-weight: 700; letter-spacing: -.01em; } .cover .brandsub { font-size: 8.5pt; color: var(--mint); letter-spacing: .14em; text-transform: uppercase; }
.cover .hero { position: absolute; right: -24mm; bottom: 64mm; width: 112mm; transform: rotate(-4deg); border-radius: 3mm; overflow: hidden;  border: 1.2mm solid #1B2742; } .cover .hero img { display: block; width: 100%; }
.cover .rule { width: 18mm; height: 1.2mm; background: var(--teal); margin: 0 0 5mm; }
.toc { list-style: none; padding: 0; margin: 0; } .toc li { display: flex; align-items: baseline; gap: 3mm; padding: 2.6mm 0; border-bottom: 1px solid var(--line); margin: 0; } .toc .n { width: 9mm; font-weight: 800; color: var(--teal-ink); } .toc .t { flex: 1; font-weight: 600; } .toc .t small { display: block; font-weight: 400; color: var(--muted); font-size: 8.5pt; } .toc .p { color: var(--muted); font-variant-numeric: tabular-nums; }
.day { position: relative; padding-left: 9mm; } .day::before { content: ""; position: absolute; left: 3mm; top: 2mm; bottom: 2mm; width: .6mm; background: var(--teal); } .day .ev { position: relative; background: #fff; border: 1px solid var(--line); border-radius: 3mm; padding: 2mm 4mm; margin-bottom: 2mm; } .day .ev::before { content: ""; position: absolute; left: -7.6mm; top: 4mm; width: 3.4mm; height: 3.4mm; border-radius: 50%; background: var(--navy); border: .8mm solid var(--teal); } .day .ev b { display: block; } .day .ev .who { font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: var(--teal-ink); font-weight: 700; }
.closing { background: var(--navy); color: #fff; padding: 0; } .closing .run, .closing .foot { display: none; } .closing .inner { position: relative; padding: 28mm 20mm; height: 100%; display: flex; flex-direction: column; justify-content: center; } .closing h1 { font-size: 34pt; } .closing .tile { margin-top: auto; width: 26mm; height: 26mm; border-radius: 6mm; margin-bottom: 10mm; }
.quote { border-left: 1.2mm solid var(--teal); padding: 2mm 0 2mm 5mm; font-size: 13pt; color: var(--navy); font-weight: 600; letter-spacing: -.01em; margin: 0 0 5mm; }
.small { font-size: 8.5pt; } .spacer { flex: 1; }
</style></head><body>

${page("cover", `<div class="glow"></div><div class="glow2"></div><div class="inner">
  <div style="display:flex;align-items:center;gap:5mm"><img class="tile" src="${TILE}" alt="ShikkhaOS logo"><div><div class="brandname">ShikkhaOS</div><div class="brandsub">School operating system</div></div></div>
  <div class="spacer"></div>
  <div class="rule"></div>
  <h1>One school.<br>One system.</h1>
  <div class="tag">A single, secure digital platform for administration, teaching, examinations and communication — built for our school.</div>
  <div style="height:70mm"></div>
  <div class="meta"><div><b>Project Proposal</b>For the School Managing Committee</div><div><b>November 2026</b>Version 1.0 — for decision</div><div><b>Platforms</b>Windows desktop · Web · Android</div></div>
  <div style="margin-top:6mm">${contact("row")}</div>
  <div class="hero"><img src="${src(find("headmaster-dashboard"))}" alt="Headmaster dashboard"></div></div>`, { head: false })}

${page("", `
  <div class="kicker">Contents</div><h2>What is inside</h2>
  <p class="lead" style="margin-bottom:6mm">Read pages 3–7 for the idea, pages 8–13 to see the system working, and pages 14–19 for safety, status and the decisions we ask for.</p>
  <ol class="toc">
    <li><span class="n">01</span><span class="t">What we are proposing<small>Executive summary and the decisions requested</small></span><span class="p">3</span></li>
    <li><span class="n">02</span><span class="t">Why change<small>Common problems and what changes</small></span><span class="p">4</span></li>
    <li><span class="n">03</span><span class="t">The system and who does what<small>Three apps, one server; four roles</small></span><span class="p">5</span></li>
    <li><span class="n">04</span><span class="t">A day in the life<small>One school day, seen by each person</small></span><span class="p">7</span></li>
    <li><span class="n">05</span><span class="t">From marks to published result<small>The seven-step, tamper-resistant process</small></span><span class="p">8</span></li>
    <li><span class="n">06</span><span class="t">The system in use<small>Review, approval, students, daily school life</small></span><span class="p">9</span></li>
    <li><span class="n">07</span><span class="t">Communication and student safety<small>Rules built in, not added later</small></span><span class="p">13</span></li>
    <li><span class="n">08</span><span class="t">Trust, security and records<small>How student data and results are protected</small></span><span class="p">14</span></li>
    <li><span class="n">09</span><span class="t">Where we are today<small>Built, tested, and what remains</small></span><span class="p">16</span></li>
    <li><span class="n">10</span><span class="t">Rollout, cost and risks<small>A safe step-by-step start</small></span><span class="p">17</span></li>
    <li><span class="n">11</span><span class="t">Decisions requested<small>Six decisions that let the pilot begin</small></span><span class="p">18</span></li>
    <li><span class="n">12</span><span class="t">Appendix<small>Everything the system covers</small></span><span class="p">19</span></li></ol>
  <div class="spacer"></div>
  <div class="quote">“One School. One System. One Connected Community.”</div>
`)}

${page("", `
  <div class="kicker">Executive summary</div><h1>What we are proposing</h1>
  <p class="lead">ShikkhaOS replaces scattered registers, spreadsheets and chat groups with one connected school system that every teacher, the Register, the Headmaster and every student can use — each seeing only what they should.</p>
  <div class="cols c4" style="margin-bottom:6mm">
    <div class="card stat"><b>3</b><span>apps: desktop, web, Android</span></div><div class="card stat"><b>4</b><span>user roles with separate powers</span></div><div class="card stat"><b>7</b><span>safe steps from marks to published result</span></div><div class="card stat"><b>1</b><span>permanent record of every change</span></div></div>
  <div class="cols c2">
    <div class="card"><h3>What the school gets</h3><ul class="check"><li>Marks entered once, checked by the Register, approved by the Headmaster, then published to students.</li><li>Daily attendance, class tests and homework in the same place.</li><li>Notices and messages that reach the right people — with student-safety rules built in.</li><li>Reports, report cards and certificates generated from the same data.</li></ul></div>
    <div class="card mint"><h3>What the committee decides</h3><p>This document shows the real system working, explains how it protects students and results, and asks for six decisions (last pages):</p><ol style="padding-left:5mm;margin:0"><li>Approve a <b>pilot</b> in one class.</li><li>Choose <b>where the system runs</b>.</li><li>Confirm <b>who may publish results</b>.</li><li>Nominate a <b>system owner</b> and training time.</li><li>Confirm the <b>messaging policy</b>.</li><li>Confirm <b>data handling</b> and backups.</li></ol></div></div>
  <div class="spacer"></div>
  <div class="box small"><b>About the pictures.</b> Every screen in this document is a real screenshot of the working system. The names, marks and notices shown are invented demonstration data — no real student information is used.</div>
`)}

${page("", `
  <div class="kicker">Why change</div><h2>Common problems — and what changes</h2>
  <p class="lead" style="margin-bottom:5mm">These are problems schools typically face when work lives on paper and in chat groups. We would confirm which apply here during the pilot.</p>
  <table class="t"><thead><tr><th style="width:42%">Typical problem today</th><th>With ShikkhaOS</th></tr></thead><tbody>
    <tr><td>Marks are written on sheets, copied to registers and re-typed for the result sheet; small errors slip through.</td><td>Teachers enter marks once. The system checks the range (0 to full marks), totals them and calculates grades and positions.</td></tr>
    <tr><td>Nobody can tell who changed a mark, or when.</td><td>Every change is recorded with who, what and when. Submitted marks are locked; corrections go through a visible request.</td></tr>
    <tr><td>Results are delayed while sheets travel between teachers, Register and Headmaster.</td><td>Each person sees exactly what is waiting for them. The Headmaster sees pending approvals on one screen.</td></tr>
    <tr><td>Students learn results late or by word of mouth.</td><td>When the Headmaster publishes, students are notified and see their own result and report card — no one else's.</td></tr>
    <tr><td>Attendance registers are checked rarely; absences are noticed late.</td><td>Teachers take attendance in seconds. Attendance percentages are always up to date for each student and class.</td></tr>
    <tr><td>Notices and questions go through informal chat groups with no school control.</td><td>Official notices and school-managed messaging. Private chat between students is not available; reports and moderation exist.</td></tr>
    <tr><td>Staff access to records is informal.</td><td>Role-based access: a teacher sees only their own classes; the Register and Headmaster have different powers.</td></tr></tbody></table>
  <div class="spacer"></div>
  <div class="cols c2" style="margin-top:6mm"><div class="card mint"><h3>Built for one school</h3><p class="small">ShikkhaOS is a private system for our school only — not a shared product. Our data stays under the school's control.</p></div><div class="card mint"><h3>No parent accounts (first release)</h3><p class="small">Students use the app. Guardian contact details are stored as records only; parents do not log in during this first release.</p></div></div>
`)}

${page("", `
  <div class="kicker">The system</div><h2>One school server, three ways in</h2>
  <p class="lead" style="margin-bottom:5mm">Everyone uses the same data through the app that suits them. Nothing is typed twice.</p>
  <div class="arch" style="margin-bottom:6mm">
    <div class="cols c3" style="gap:3mm"><div class="node"><b>Windows desktop app</b><br><span class="small muted">Headmaster · Register · Teachers</span></div><div class="node"><b>Web app (any browser)</b><br><span class="small muted">All roles</span></div><div class="node"><b>Android app</b><br><span class="small muted">Students</span></div></div>
    <div class="arrow" style="font-size:14pt;line-height:1">⇅</div>
    <div class="node big"><b>ShikkhaOS school server</b><br><span class="small" style="color:#B8C4D6">Rules · permissions · database · audit record</span></div></div>
  <div class="cols c-7-5">
    ${shot("headmaster-dashboard", "Headmaster dashboard (desktop/web): what needs attention, at a glance.")}
    <div class="cols" style="gap:3mm;align-content:start">${phone("phone-dashboard", "Student view on a phone")}</div></div>
  <div class="cols c3" style="margin-top:5mm">
    <div class="card"><h3>Desktop</h3><p class="small muted">A proper Windows application for staff: quick search (Ctrl+K), tabs, notifications, light/dark theme.</p></div>
    <div class="card"><h3>Web</h3><p class="small muted">Works in any modern browser with the same screens and rules — handy on a shared office computer.</p></div>
    <div class="card"><h3>Android</h3><p class="small muted">A student app for results, attendance, homework, notices and messages, with notifications.</p></div></div>
`)}

${page("", `
  <div class="kicker">People and powers</div><h2>Who does what</h2>
  <p class="lead" style="margin-bottom:5mm">Four kinds of users. What each person can do is set by the school, and enforced by the server — hiding a button is never the only protection.</p>
  <div class="cols c2" style="margin-bottom:5mm">
    <div class="card role"><h3><span class="ic">${icon("headmaster")}</span>Headmaster</h3><ul class="small"><li>School-wide dashboard and reports</li><li>Authorizes exams; <b>approves and publishes</b> results</li><li>Sets who may do what (permissions)</li><li>Official announcements, moderation, audit log</li></ul></div>
    <div class="card role"><h3><span class="ic">${icon("registrar")}</span>Register</h3><ul class="small"><li>Admissions, student and teacher records</li><li>Sets up exams; <b>checks marks</b> from teachers</li><li>Requests corrections; compiles results</li><li>Certificates, report cards, documents</li><li>Publishes only if the Headmaster delegates it</li></ul></div>
    <div class="card role"><h3><span class="ic">${icon("teacher")}</span>Teacher</h3><ul class="small"><li>Sees <b>only their own</b> classes and subjects</li><li>Attendance, marks entry, class tests, homework</li><li>Submits marks to the Register; fixes corrections</li><li>Messages colleagues, own class group</li></ul></div>
    <div class="card role"><h3><span class="ic">${icon("student")}</span>Student</h3><ul class="small"><li>Sees <b>only their own</b> record</li><li>Published results and report cards</li><li>Attendance, class tests, homework, notices</li><li>Messages to their own teachers (school-controlled)</li></ul></div></div>
  <div class="box"><b>Headmaster and Register are deliberately different.</b> The Register prepares and verifies; the Headmaster approves. The person who verified marks cannot also approve them, and approving or publishing needs the password to be typed again.</div>
  <div class="cols c2">${shot("teacher-dashboard-correction", "Teacher dashboard: a correction request from the Register is highlighted.")}${shot("students-registry", "Register: student registry with search and class filters.")}</div>
`)}

${page("", `
  <div class="kicker">A day in the life</div><h2>One school day, seen by each person</h2>
  <p class="lead" style="margin-bottom:5mm">An illustrative day, using the demonstration school. It shows how the pieces fit together without anyone retyping anything.</p>
  <div class="cols c-5-7" style="align-items:start">
    <div class="day">
      <div class="ev"><span class="who">8:05 · Teacher</span><b>Takes attendance in seconds</b><span class="small muted">Roll call on a tablet or computer; absences are counted straight away.</span></div>
      <div class="ev"><span class="who">10:30 · Teacher</span><b>Gives homework</b><span class="small muted">Posted to the class; students see it in the app.</span></div>
      <div class="ev"><span class="who">12:00 · Teacher</span><b>Submits exam marks</b><span class="small muted">Range-checked, totalled; locked once submitted.</span></div>
      <div class="ev"><span class="who">13:15 · Register</span><b>Checks the submission</b><span class="small muted">Spots a doubtful total and requests a correction with a reason.</span></div>
      <div class="ev"><span class="who">14:00 · Teacher</span><b>Fixes and resubmits</b><span class="small muted">Saved as a new revision; the old one is kept.</span></div>
      <div class="ev"><span class="who">15:30 · Headmaster</span><b>Approves and publishes</b><span class="small muted">Password typed again; the decision is recorded.</span></div>
      <div class="ev"><span class="who">15:31 · Student</span><b>Sees the result</b><span class="small muted">A notification arrives; only their own result opens.</span></div></div>
    <div style="display:grid;gap:4mm">${shot("attendance-roll-call", "Teacher: roll call with present, absent and late.")}${shot("results-approval", "Headmaster: approval screen with the full result before publishing.")}</div></div>
  <div class="box small" style="margin-top:3mm"><b>Result:</b> the work that used to take days of sheets and walking between rooms becomes a short chain of clear steps — and each step is visible to the next person.</div>
`)}

${page("", `
  <div class="kicker">The most important process</div><h2>From marks to published result</h2>
  <p class="lead" style="margin-bottom:5mm">Results are the most sensitive thing a school publishes. ShikkhaOS makes the path explicit, so every step has an owner and a record.</p>
  <div class="flow" style="margin-bottom:6mm">
    <div class="step"><b>Register creates the exam</b><span>Adds papers for each class and subject.</span></div>
    <div class="step gate"><b>Headmaster authorizes</b><span>Marks entry opens for the assigned teachers.</span></div>
    <div class="step"><b>Teacher enters marks</b><span>Invalid marks are rejected on the spot.</span></div>
    <div class="step"><b>Teacher submits</b><span>The sheet is locked — no silent edits.</span></div>
    <div class="step"><b>Register reviews</b><span>Can request a correction with a reason.</span></div>
    <div class="step"><b>Register verifies</b><span>Then compiles the class result.</span></div>
    <div class="step gate"><b>Headmaster approves</b><span>Password confirmed again. Can send back.</span></div>
    <div class="step gate"><b>Result is published</b><span>Only after approval. Cannot be overwritten.</span></div>
    <div class="step"><b>Students are notified</b><span>Each sees only their own result.</span></div></div>
  <div class="cols c2">${shot("exam-progress", "Exam progress board: every paper and section with its current status.")}${shot("marks-entry-grid", "Teacher marks entry: keyboard-friendly grid, running total, save draft / submit.")}</div>
  <div class="cols c3" style="margin-top:5mm">
    <div class="card mint small"><b>Corrections are visible.</b> The Register flags rows and writes a reason; the teacher sees it and resubmits as a new revision. Old versions are kept.</div>
    <div class="card mint small"><b>Published means final.</b> A published result cannot be edited. A mistake found later needs a request approved by the Headmaster and creates a new revision — the old one stays on record.</div>
    <div class="card mint small"><b>Class tests are separate.</b> Teachers can share class-test marks with their class, but these never change the official result.</div></div>
`)}

${page("", `
  <div class="kicker">In use — review</div><h2>The Register checks every submission</h2>
  <p class="lead" style="margin-bottom:5mm">Submitted marks arrive in the Register's inbox. Nothing is lost between the teacher and the Register, and nothing can be changed quietly.</p>
  ${shot("review-inbox", "Register's inbox: submissions waiting for review, filtered by status (awaiting review, under review, corrections, verified).")}
  <div style="height:5mm"></div>
  ${shot("correction-requested", "Teacher's view after a correction request: the Register's reason and the flagged rows are shown; the teacher fixes and resubmits as a new revision.")}
  <div class="cols c3" style="margin-top:5mm"><div class="card small"><b>Clear statuses</b><br>Draft, Submitted, Under review, Correction requested, Verified — always visible.</div><div class="card small"><b>Reasons are required</b><br>A correction request must say why; the teacher sees it next to the marks.</div><div class="card small"><b>History is kept</b><br>Each submission keeps every revision and who did what.</div></div>
`)}

${page("", `
  <div class="kicker">In use — approval</div><h2>The Headmaster decides</h2>
  <p class="lead" style="margin-bottom:5mm">Once every paper of a class is verified, the Register compiles the class result. The Headmaster sees the numbers and approves — or sends it back.</p>
  ${shot("results-approval", "Headmaster's approval screen: pass rate, failures and absences at a glance. Actions: Approve, or Send back to Register with a reason.")}
  <div class="cols c3" style="margin-top:5mm"><div class="card small"><b>Fewer surprises</b><br>Pass rate, failures, absences and every student's marks, grade and position are shown before approval.</div><div class="card small"><b>Send back</b><br>If something looks wrong, the Headmaster returns the result with a reason. It is re-checked and re-compiled as a new revision.</div><div class="card small"><b>Two-person control</b><br>The person who entered marks cannot verify them; the verifier cannot approve them. Approval needs the password again.</div></div>
`)}

${page("", `
  <div class="kicker">In use — students</div><h2>Students see their own results — and only theirs</h2>
  <p class="lead" style="margin-bottom:5mm">When the Headmaster publishes, each student is notified and can open their result and download a report card.</p>
  <div class="cols c-7-5">
    <div>${shot("student-result", "Student's result page (web): subject-wise marks, grade and GPA.", { w: 700 })}<div class="cols c2" style="margin-top:5mm">${shot("student-dashboard", "Student dashboard: attendance, homework, latest result, notices.")}${shot("class-tests", "Class tests: shared with the class, clearly separate from official results.")}</div></div>
    <div class="cols" style="gap:5mm;align-content:start">${phone("phone-result", "Result on a phone")}<div class="card mint small"><b>Same rules everywhere.</b> A student can open only their own result, attendance and homework — on the phone, the web or any other device.</div></div></div>
  <div class="box small" style="margin-top:5mm"><b>Note.</b> The phone pictures show the student screens on a phone-sized display. The dedicated Android app has its own native screens with the same features; it is built and tested, and its first installable build is produced by the automated release process (see “Where we are today”).</div>
`)}

${page("", `
  <div class="kicker">In use — daily school life</div><h2>Attendance, class tests and homework</h2>
  <div class="cols c-5-7" style="margin-bottom:5mm"><div><h3>Attendance in seconds</h3><p class="small muted">The class teacher marks Present / Absent / Late / Excused for the whole class on one screen. Students marked absent are notified. Past records can be corrected only with a written reason, and the correction is logged.</p><ul class="small check"><li>“Mark all present” then change exceptions</li><li>Attendance % per student and per section</li><li>Summary report for the Headmaster</li></ul></div>${shot("attendance-roll-call", "Teacher: roll call for Class 6-A.")}</div>
  <div class="cols c2">${shot("homework-teacher", "Teacher: homework with due date; students submit text or photos/files; teacher grades with feedback.")}<div class="card mint"><h3>Homework flow</h3><ol class="small" style="padding-left:5mm;margin:0"><li>Teacher creates and publishes homework for a class.</li><li>Students are notified, and reminded 24 hours before the deadline.</li><li>Students submit answers (text, photo or file).</li><li>Teacher grades and gives feedback; the student is notified.</li></ol><p class="small muted" style="margin-top:3mm">Late submissions are flagged automatically.</p></div></div>
`)}

${page("", `
  <div class="kicker">Communication and student safety</div><h2>Messages the school can stand behind</h2>
  <p class="lead" style="margin-bottom:5mm">Communication is built into ShikkhaOS so that it follows school rules and protects students.</p>
  <div class="cols c-7-5" style="margin-bottom:5mm">${shot("messages-chat", "A student asks her teacher a question; the teacher replies. Messages arrive live.")}<div class="card"><h3>Safety rules built in</h3><ul class="small check"><li><b>No private chat between students.</b> It is switched off and cannot be enabled by mistake.</li><li>Students can message only their <b>own teachers</b> and the school office, and the school can switch either off.</li><li>Class groups follow enrollment automatically; students read, and post only if the teacher allows.</li><li>Any message can be <b>reported</b>; the Headmaster can hide it or suspend a user's messaging.</li><li>When a moderator reads a student conversation, <b>that read is recorded</b>.</li></ul></div></div>
  <div class="cols c2">${shot("notices", "Notices: targeted to everyone, a role, a class or a section; pinned notices stay on top.")}${shot("settings-policies", "School settings: the Headmaster controls messaging and publishing policy.")}</div>
`)}

${page("", `
  <div class="kicker">Control, trust and records</div><h2>Who can do what — and a record of everything</h2>
  <div class="cols c2" style="margin-bottom:5mm">${shot("permissions", "Headmaster: per-person permissions. Every change needs a reason and the password.")}${shot("audit-log", "Audit log: a permanent, read-only history of important actions.")}</div>
  <div class="cols c-5-7"><div class="card navy"><h3>Protection at a glance</h3><ul class="small check" style="color:#fff"><li>Passwords stored securely; account locks after repeated wrong attempts.</li><li>Staff and students see only what their role allows.</li><li>Approving or publishing needs the password typed again.</li><li>Published results and the audit log cannot be altered.</li><li>Uploaded files are checked before they are accepted.</li><li>Private information is never put in notification text.</li></ul></div>${shot("reports-chart", "Reports with charts (and a table alternative): grade distribution, attendance, enrollment, exam analysis.", { w: 760 })}</div>
`)}

${page("", `
  <div class="kicker">Trust and security</div><h2>How student data and results are protected</h2>
  <p class="lead" style="margin-bottom:5mm">Protection is enforced by the school server — the screens only reflect it. This table lists what could go wrong and what stops it.</p>
  <table class="t"><thead><tr><th style="width:30%">What could go wrong</th><th>What prevents it</th></tr></thead><tbody>
    <tr><td>Someone guesses or steals a password</td><td>Passwords are stored in a one-way secure form; repeated wrong attempts lock the account; sessions expire and can be ended per device.</td></tr>
    <tr><td>A staff member views or edits what they should not</td><td>Every request is checked against the person's role and assignment on the server. A teacher cannot open another teacher's class.</td></tr>
    <tr><td>A mark is quietly changed after submission</td><td>Submitted marks are locked. Corrections require a reason and create a new revision; the audit log records who and when.</td></tr>
    <tr><td>One person verifies and approves their own work</td><td>Separation of duties is enforced: the verifier cannot approve. Approving and publishing need the password again.</td></tr>
    <tr><td>A published result is altered later</td><td>Published results are protected at the database level; changes appear only as a new, visible revision.</td></tr>
    <tr><td>Students contact each other privately or are contacted by strangers</td><td>Student-to-student chat does not exist. Messages are limited to their own teachers and the office; any message can be reported and hidden.</td></tr>
    <tr><td>An unsafe file is uploaded</td><td>Files are checked for type and size before being accepted.</td></tr>
    <tr><td>Private data leaks through notifications</td><td>Notification text never contains marks or private details.</td></tr></tbody></table>
  <div class="spacer"></div>
  <div class="cols c2"><div class="card navy"><h3>Checked, not just promised</h3><p class="small muted">The server's security rules are covered by automated tests, a dependency vulnerability audit passes, and the screens were checked against accessibility standards (WCAG 2.1 A/AA).</p></div><div class="card mint"><h3>Still the school’s decision</h3><p class="small">Where the data is hosted, who holds admin passwords, and how often backups are checked are policy choices for the committee — see the decisions page.</p></div></div>
`)}

${page("", `
  <div class="kicker">Where we are today</div><h2>What is built, tested — and what remains</h2>
  <div class="cols c2" style="margin-bottom:5mm">
    <div class="card"><h3>Built and tested</h3><ul class="small check"><li>Complete school server and all four user roles.</li><li>Exam → marks → review → approval → publish workflow, including corrections, send-back and revisions.</li><li>Attendance, class tests, homework, notices, messaging with safety rules, reports, certificates and report cards (PDF).</li><li>Web app, Windows desktop app and Android student app (source complete).</li><li>Bulk student import from a spreadsheet (CSV).</li><li>English and Bengali (core screens on web/desktop).</li></ul></div>
    <div class="card"><h3>Quality checks run so far</h3><ul class="small check"><li>48 automated tests on the server (including full result workflow and security checks).</li><li>30 tests on the apps, plus 8 end-to-end tests that click through the real screens.</li><li>Accessibility check (WCAG 2.1 A/AA) on about 20 screens: no violations found.</li><li>A full exam cycle was run end to end through the real screens.</li></ul></div></div>
  <div class="card" style="border-color:#F2D9A6;background:#FFFBEB"><h3 style="color:var(--warn)">Still to do before go-live</h3>
    <table class="t small" style="margin-top:2mm"><thead><tr><th>Item</th><th>Why it is open</th></tr></thead><tbody>
      <tr><td>Windows installer and Android app files</td><td>Produced by the automated release process on GitHub; their first run and signing keys are still to be set up and tested.</td></tr>
      <tr><td>Phone push notifications</td><td>In-app and live notifications work; delivery to a closed phone needs a Firebase setup.</td></tr>
      <tr><td>Hosting, backups and monitoring</td><td>Depends on the committee's hosting choice (next pages).</td></tr>
      <tr><td>Android app in Bengali</td><td>Web/desktop are bilingual; the Android app is English-only for now.</td></tr>
      <tr><td>Bengali text on printed PDFs</td><td>Report-card PDFs currently support English text only; Bengali names need a font upgrade.</td></tr>
      <tr><td>Real-school pilot</td><td>The system has been tested with demonstration data, not yet with our real classes.</td></tr></tbody></table></div>
`)}

${page("", `
  <div class="kicker">Rollout</div><h2>A safe, step-by-step start</h2>
  <p class="lead" style="margin-bottom:5mm">We recommend starting small, learning, and expanding. Durations are indicative estimates to be confirmed with the committee.</p>
  <div class="timeline" style="margin-bottom:6mm">
    <div class="phase"><div class="when">Phase 1 · about 2 weeks</div><h3>Prepare</h3><ul class="small"><li>Choose hosting; set up the school server and backups</li><li>Create Headmaster, Register and teacher accounts</li><li>Import students from a spreadsheet</li></ul></div>
    <div class="phase"><div class="when">Phase 2 · about 4 weeks</div><h3>Pilot: one class</h3><ul class="small"><li>Attendance, homework, notices, messages</li><li>Short training for the pilot teachers</li><li>Weekly feedback meeting</li></ul></div>
    <div class="phase"><div class="when">Phase 3 · one exam cycle</div><h3>First exam on the system</h3><ul class="small"><li>Marks entry, review and approval for the pilot class</li><li>Run alongside the usual paper process once</li><li>Compare results; fix issues</li></ul></div>
    <div class="phase"><div class="when">Phase 4 · after review</div><h3>Whole school</h3><ul class="small"><li>All classes and teachers</li><li>Student Android app rollout</li><li>Ongoing support and updates</li></ul></div></div>
  <div class="cols c2">
    <div class="card"><h3>What running it needs</h3><ul class="small"><li>A small server (school office computer or rented cloud server), always on, with internet.</li><li>A web address (domain) and a security certificate for the site.</li><li>Daily automatic backups, stored away from the server.</li><li>One person per week for the first months for support questions.</li></ul><p class="small muted">An itemized cost estimate will be prepared once the hosting option is chosen.</p></div>
    <div class="card"><h3>Risks and how we handle them</h3><table class="t small"><tbody><tr><td><b>Staff unfamiliar</b></td><td>Short hands-on training, pilot first.</td></tr><tr><td><b>Internet outage</b></td><td>Paper fallback during pilot; apps recover automatically.</td></tr><tr><td><b>Data loss</b></td><td>Automatic backups and tested restore.</td></tr><tr><td><b>Wrong access</b></td><td>Roles reviewed by the Headmaster; audit log.</td></tr></tbody></table></div></div>
`)}

${page("", `
  <div class="kicker">For the committee</div><h2>Decisions we request</h2>
  <p class="lead" style="margin-bottom:5mm">Six decisions allow the pilot to begin.</p>
  <ol class="decide" style="padding:0;margin:0 0 5mm">
    <li><b>Approve the pilot</b> in one class (suggested: Class 6, two sections) for one term, as described in Phases 1–3.</li>
    <li><b>Choose where the system runs:</b> (a) rented cloud server, or (b) a school-owned server. We will prepare costs for the chosen option.</li>
    <li><b>Decide who may publish results.</b> Default recommendation: <b>only the Headmaster</b>. The Register may be allowed per exam if the committee wishes.</li>
    <li><b>Nominate a system owner</b> (suggested: the Register) and set aside training time for pilot teachers.</li>
    <li><b>Confirm messaging policy:</b> students may message their own teachers and the school office (recommended), or teachers only.</li>
    <li><b>Confirm data handling:</b> student records stay on the school's own system; who may export data and how often backups are checked.</li></ol>
  <div class="cols c2"><div class="card mint"><h3>What the school provides</h3><ul class="small"><li>List of students (name, ID, class, section, roll, guardian phone).</li><li>List of teachers and their class/subject assignments.</li><li>Grading rules (current marks-to-grade scale).</li><li>A decision-maker for questions during the pilot.</li></ul></div><div class="card"><h3>What the committee receives</h3><ul class="small"><li>A working system for the pilot, with training.</li><li>Weekly progress notes during the pilot.</li><li>A pilot review: what worked, what to change, whether to proceed.</li><li>Full source and documentation for the school's records.</li></ul></div></div>
  <div class="spacer"></div>
  <div class="card navy" style="display:flex;justify-content:space-between;gap:6mm"><div><b>Committee decision</b><div class="muted small">Date: ____ / ____ / ________</div></div><div class="small muted">Approved ☐ &nbsp; Approved with changes ☐ &nbsp; Not approved ☐<br>Chairperson signature: ______________________</div></div>
`)}

${page("", `
  <div class="kicker">Appendix</div><h2>Everything the system covers</h2>
  <table class="t small"><thead><tr><th style="width:28%">Area</th><th>What it includes</th></tr></thead><tbody>
    <tr><td>Identity and access</td><td>Sign-in, forced password change, device list, per-person permissions, password re-confirmation for sensitive actions.</td></tr>
    <tr><td>School setup</td><td>School profile, grading scale, academic sessions, classes, sections, subjects, teacher assignments, promotions.</td></tr>
    <tr><td>People</td><td>Student registry (with CSV import and archive), teacher records, enrollments, class groups.</td></tr>
    <tr><td>Examinations</td><td>Exams and papers, authorization, marks entry, submission, review, correction, verification, compilation, approval, send-back, publishing, revisions.</td></tr>
    <tr><td>Daily work</td><td>Attendance, class tests (separate from official results), homework and grading.</td></tr>
    <tr><td>Communication</td><td>Direct messages, class groups, official channels, notices with targeting, notifications, moderation.</td></tr>
    <tr><td>Documents</td><td>Report cards and certificates (PDF), document library, file attachments with safety checks.</td></tr>
    <tr><td>Reports and oversight</td><td>Enrollment, attendance, exam analysis, teacher submission status, grade distribution; CSV export; audit log; global search.</td></tr></tbody></table>
  <div class="cols c2" style="margin-top:5mm"><div class="card"><h3>Technology, in plain words</h3><p class="small">The school server is written in Rust, a language known for speed and safety, and stores data in PostgreSQL, a widely trusted database. The apps use common, well-supported tools. Updates are delivered as versioned releases with checksums so the school can verify them.</p></div><div class="card"><h3>Document information</h3><p class="small">Prepared from the working system and its automated test results. Screens show demonstration data. Quality figures are those recorded at the time of writing (November 2026).</p></div></div>
`)}
${page("closing", `<div class="glow"></div><div class="glow2"></div><div class="inner">
  <img class="tile" src="${TILE}" alt="ShikkhaOS logo">
  <div class="rule" style="width:18mm;height:1.2mm;background:var(--teal);margin-bottom:6mm"></div>
  <h1>Let’s begin with one class.</h1>
  <div class="tag" style="font-size:14pt;color:var(--mint);max-width:130mm;margin-bottom:10mm">A small pilot lets teachers, the Register and the Headmaster judge ShikkhaOS on real work — with paper as a safety net — before the whole school commits.</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;border-top:1px solid rgba(220,239,235,.3);padding-top:6mm;font-size:9.5pt;color:#C7D6E8"><div><b style="color:#fff;display:block">Step 1</b>Committee approves the pilot</div><div><b style="color:#fff;display:block">Step 2</b>We prepare the server, accounts and training</div><div><b style="color:#fff;display:block">Step 3</b>One class, one term, weekly review</div></div>
  <div style="margin-top:9mm"><div style="font-size:8.5pt;letter-spacing:.14em;text-transform:uppercase;color:#9FB1C9;margin-bottom:3mm">Payment on the contract</div>
  <div style="display:grid;grid-template-columns:3fr 3fr 4fr;gap:3mm">
    <div style="border:1px solid rgba(220,239,235,.3);border-radius:3mm;padding:4mm"><div style="font-size:22pt;font-weight:800;color:#5EEAD4;line-height:1">30%</div><b style="display:block;margin-top:2mm;font-size:10pt">On signing the contract</b><span style="font-size:8.5pt;color:#B8C4D6">Work begins: server setup, accounts, import.</span></div>
    <div style="border:1px solid rgba(220,239,235,.3);border-radius:3mm;padding:4mm"><div style="font-size:22pt;font-weight:800;color:#5EEAD4;line-height:1">30%</div><b style="display:block;margin-top:2mm;font-size:10pt">At pilot go-live</b><span style="font-size:8.5pt;color:#B8C4D6">System running for the pilot class; staff trained.</span></div>
    <div style="border:1px solid rgba(220,239,235,.3);border-radius:3mm;padding:4mm;background:rgba(20,184,166,.12)"><div style="font-size:22pt;font-weight:800;color:#5EEAD4;line-height:1">40%</div><b style="display:block;margin-top:2mm;font-size:10pt">On whole-school handover</b><span style="font-size:8.5pt;color:#B8C4D6">All classes live, pilot review accepted by the committee.</span></div></div>
  <div style="font-size:8pt;color:#9FB1C9;margin-top:2mm">Milestones are proposed and can be adjusted in the contract. The total amount follows the itemized estimate after the hosting decision.</div></div>
  <div style="margin-top:9mm;border-top:1px solid rgba(220,239,235,.3);padding-top:6mm"><div style="font-size:8.5pt;letter-spacing:.14em;text-transform:uppercase;color:#9FB1C9;margin-bottom:4mm">Contact</div>${contact("column")}</div>
  <div style="margin-top:auto;font-size:9pt;color:#9FB1C9">ShikkhaOS · One School. One System. One Connected Community.</div></div>`, { head: false })}
</body></html>`;

writeFileSync(path.join(dir, "index.html"), html);
console.log(`index.html written (${(html.length / 1e6).toFixed(1)} MB, ${pageNo} pages, inline images: ${inline})`);

if (process.argv.includes("--pdf")) {
  const { chromium } = await import("playwright");
  const b = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined, args: ["--no-sandbox"] });
  const p = await b.newPage(); await p.goto("file://" + path.join(dir, "index.html")); await p.waitForTimeout(800);
  await p.pdf({ path: path.join(dir, "ShikkhaOS-Proposal.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await b.close(); console.log("ShikkhaOS-Proposal.pdf written");
}
