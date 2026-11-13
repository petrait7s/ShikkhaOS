// Landscape app-flow proposal. Usage: PW_EXECUTABLE=... node docs/proposal/build-short.mjs
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
const page = (body, cls = "") => { n++; return `<section class="page ${cls}">${cls === "cover" ? "" : `<header><span class="br"><img src="${LOGO}" alt=""><b>ShikkhaOS</b></span><span>App flow</span></header>`}${body}${cls === "cover" ? "" : `<footer><span>petrait.site</span><span>${n}</span></footer>`}</section>`; };
const fig = (k, i, cap, h) => { const s = sizes[find(k)]; const px = Math.min(s.h, Math.round(h * 1.5)); return `<figure class="shot"><div class="bar"><i></i><i></i><i></i></div><div class="win" style="aspect-ratio:${s.w}/${px}"><img src="${img(k)}" alt=""></div><figcaption><em>${i}</em>${cap}</figcaption></figure>`; };
const steps = (arr) => `<div class="strip">${arr.map(([t, d], i) => `<div class="st"><em>${i + 1}</em><div><b>${t}</b><span>${d}</span></div></div>`).join("")}</div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ShikkhaOS — App flow</title><style>
:root{--navy:#0F172A;--teal:#14B8A6;--ink2:#0F766E;--mint:#DCEFEB;--pearl:#F7F9FC;--muted:#475569;--line:#D6E3E1}
*{box-sizing:border-box}html{background:#E4ECEB}body{margin:0;font:10pt/1.45 Inter,"Segoe UI",system-ui,sans-serif;color:var(--navy);-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 landscape;margin:0}.page{width:297mm;height:210mm;margin:10mm auto;background:var(--pearl);position:relative;overflow:hidden;padding:20mm 16mm 14mm;display:flex;flex-direction:column;break-after:page}
@media screen{.page{box-shadow:0 8px 30px rgba(15,23,42,.18)}}@media print{html{background:none}.page{margin:0}}
.page:not(.cover)::before{content:"";position:absolute;left:0;top:0;width:100%;height:1.6mm;background:linear-gradient(90deg,var(--navy) 0 70%,var(--teal) 70%)}
header{position:absolute;top:8mm;left:16mm;right:16mm;display:flex;justify-content:space-between;font-size:8pt;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:1.6mm}.br{display:flex;align-items:center;gap:2mm;color:var(--navy)}.br img{height:4.4mm}
footer{position:absolute;bottom:5.5mm;left:16mm;right:16mm;display:flex;justify-content:space-between;font-size:8pt;color:var(--muted)}
.k{font-size:8pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);margin-bottom:1.5mm}.k::before{content:"";display:inline-block;width:6mm;height:.7mm;background:var(--teal);vertical-align:middle;margin-right:2mm}
h1{font-size:22pt;line-height:1.1;margin:0 0 2mm;letter-spacing:-.02em}h3{font-size:10.5pt;margin:0 0 1mm}p{margin:0 0 2mm}.lead{font-size:11pt;color:var(--muted);margin-bottom:5mm}.m{color:var(--muted)}.s{font-size:9pt}
.card{background:#fff;border:1px solid var(--line);border-radius:3.5mm;padding:4mm}.card.mint{background:var(--mint);border-color:transparent}.card.navy{background:var(--navy);color:#fff;border-color:transparent}.card.navy .m{color:#B8C4D6}
.shot{margin:0;background:#fff;border:1px solid var(--line);border-radius:3mm;overflow:hidden}.bar{display:flex;gap:1.3mm;padding:1.6mm 2.5mm;background:var(--navy)}.bar i{width:1.8mm;height:1.8mm;border-radius:50%;background:var(--teal)}.bar i:nth-child(2){background:var(--mint)}.bar i:nth-child(3){background:#fff;opacity:.5}
.win{overflow:hidden}.win img{display:block;width:100%}figcaption{font-size:8.5pt;color:var(--navy);padding:2mm 3mm;border-top:1px solid var(--line);background:#fff;display:flex;gap:2mm;align-items:center;font-weight:600}
figcaption em,.st em{font-style:normal;flex:none;width:5.2mm;height:5.2mm;border-radius:50%;background:var(--teal);color:var(--navy);font-weight:800;font-size:8.5pt;display:grid;place-items:center}
.phone{margin:0 auto;width:42mm}.scr{background:var(--navy);border-radius:6mm;padding:1.8mm}.scr img{display:block;width:100%;border-radius:4.6mm;aspect-ratio:390/720;object-fit:cover;object-position:top}.phone figcaption{border:0;background:none;justify-content:center;padding-top:2mm}
.strip{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:3mm;margin-bottom:4mm}.st{display:flex;gap:2.5mm;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:3mm;padding:2.6mm 3mm}.st b{display:block;font-size:9.5pt}.st span{font-size:8.5pt;color:var(--muted)}
.cols{display:grid;gap:4mm;align-items:start}
.lane{display:grid;grid-template-columns:repeat(4,1fr);gap:9mm;position:relative}.lane .col{background:#fff;border:1px solid var(--line);border-radius:4mm;padding:4mm;position:relative}.lane .col.hd{background:var(--navy);color:#fff;border-color:var(--navy)}.lane .col:not(:last-child)::after{content:"→";position:absolute;right:-8mm;top:50%;font-size:16pt;color:var(--ink2);transform:translateY(-50%)}
.lane .role{display:flex;align-items:center;gap:2mm;font-weight:800;font-size:11pt;margin-bottom:2mm}.lane .who{font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase;color:var(--ink2);font-weight:700}.lane .hd .who{color:var(--teal)}
.lane ul{list-style:none;padding:0;margin:0 0 3mm}.lane li{position:relative;padding-left:4.5mm;margin-bottom:1.2mm;font-size:9pt}.lane li::before{content:"";position:absolute;left:0;top:1.8mm;width:2mm;height:2mm;border-radius:50%;background:var(--teal)}
.lane .thumb{border:1px solid var(--line);border-radius:2mm;overflow:hidden}.lane .thumb img{display:block;width:100%}
.cover{background:var(--navy);color:#fff;padding:0}.cover .in{position:relative;height:100%;padding:20mm 22mm 16mm;display:flex;flex-direction:column}.glow{position:absolute;width:200mm;height:200mm;right:-60mm;top:-80mm;background:radial-gradient(circle,rgba(20,184,166,.5),rgba(20,184,166,0) 65%)}
.cover .tile{width:18mm;height:18mm;border-radius:4.2mm}.cover h1{font-size:46pt;letter-spacing:-.03em;margin:0 0 3mm}.rule{width:18mm;height:1.2mm;background:var(--teal);margin-bottom:5mm}.cover .tag{font-size:14pt;color:var(--mint);max-width:150mm}
.ct{display:inline-flex;align-items:center;gap:2.4mm;text-decoration:none;font-size:9.5pt;margin-left:8mm}
.note{display:flex;gap:3mm;align-items:center;background:var(--mint);border-radius:3mm;padding:3mm 4mm;font-size:9pt;margin-top:4mm}.note b{white-space:nowrap}
</style></head><body>

${page(`<div class="glow"></div><div class="in"><img class="tile" src="${TILE}" alt="ShikkhaOS"><div style="margin:auto 0 0"><div class="rule"></div><h1>ShikkhaOS</h1><div style="font-size:24pt;font-weight:700;letter-spacing:-.02em;line-height:1.15;margin-bottom:5mm">How it works:<br>Teacher → Headmaster → Student &amp; Guardian</div><div class="tag">App flow walkthrough</div></div><div style="margin-top:auto;border-top:1px solid rgba(220,239,235,.3);padding-top:5mm;display:flex;justify-content:space-between;align-items:center;font-size:9.5pt;color:#C7D6E8"><span>November 2026</span><span>${contact("#5EEAD4", "#E6EEF7")}</span></div></div>`, "cover")}

${page(`<div class="k">The flow</div><h1>From classroom to the student’s phone</h1><p class="lead">Four people, one chain. Each step is visible to the next person.</p>
  <div class="lane">
    <div class="col"><div class="who">Step 1</div><div class="role">Teacher</div><ul><li>Takes attendance</li><li>Enters marks</li><li>Submits to the Register</li></ul><div class="thumb"><img src="${img("marks-entry-grid")}" style="height:56mm;object-fit:cover;object-position:top left" alt=""></div></div>
    <div class="col"><div class="who">Step 2</div><div class="role">Register</div><ul><li>Reviews each submission</li><li>Requests a correction if needed</li><li>Verifies and compiles the result</li></ul><div class="thumb"><img src="${img("review-inbox")}" style="height:56mm;object-fit:cover;object-position:top left" alt=""></div></div>
    <div class="col hd"><div class="who">Step 3</div><div class="role">Headmaster</div><ul><li style="color:#fff">Checks the compiled result</li><li style="color:#fff">Approves, or sends it back</li><li style="color:#fff">Publishes to students</li></ul><div class="thumb"><img src="${img("results-approval")}" style="height:56mm;object-fit:cover;object-position:top left" alt=""></div></div>
    <div class="col"><div class="who">Step 4</div><div class="role">Student &amp; Guardian</div><ul><li>Student gets a notification</li><li>Opens own result and report card</li><li>Guardian views it with the student</li></ul><div class="thumb"><img src="${img("student-result")}" style="height:56mm;object-fit:cover;object-position:top left" alt=""></div></div></div>
  <div style="margin-top:7mm" class="cols" style="grid-template-columns:repeat(3,1fr)"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4mm"><div class="card mint"><h3>Locked after submit</h3><p class="s" style="margin:0">Marks cannot be changed quietly.</p></div><div class="card mint"><h3>Two people decide</h3><p class="s" style="margin:0">The one who verifies cannot approve.</p></div><div class="card mint"><h3>Published is final</h3><p class="s" style="margin:0">Any change is a new, visible revision.</p></div></div></div>`)}

${page(`<div class="k">Teacher</div><h1>Teacher: attendance, marks, submit</h1><p class="lead" style="margin-bottom:3mm">A teacher sees only their own classes and subjects.</p>
  ${steps([["Open dashboard", "Today’s work and any correction request"], ["Take attendance", "Present, absent, late in seconds"], ["Enter marks", "Invalid marks rejected on the spot"], ["Submit", "Marks lock and go to the Register"]])}
  <div class="cols" style="grid-template-columns:1fr 1fr">${fig("attendance-roll-call", 2, "Attendance: present, absent, late", 900)}${fig("marks-entry-grid", 3, "Marks entry: running total, save draft or submit", 900)}</div>
  <div class="note"><b>If the Register finds a problem:</b> the teacher sees the reason and the flagged rows, fixes them and submits again as a new revision.</div>`)}

${page(`<div class="k">Headmaster</div><h1>Headmaster: review, approve, publish</h1><p class="lead" style="margin-bottom:3mm">The Register prepares the result. The Headmaster decides.</p>
  ${steps([["See what is waiting", "Dashboard shows pending approvals"], ["Check the result", "Marks, pass rate, positions"], ["Approve", "Password typed again to confirm"], ["Publish", "Students are notified"]])}
  <div class="cols" style="grid-template-columns:1fr 1fr">${fig("headmaster-dashboard", 1, "Dashboard: pending approvals", 900)}${fig("results-approval", 2, "Compiled result: approve, send back or publish", 900)}</div>
  <div class="note"><b>Safety:</b> published results cannot be edited. Every action is saved in a permanent audit log.</div>`)}

${page(`<div class="k">Student &amp; guardian</div><h1>What the student — and guardian — see</h1><p class="lead" style="margin-bottom:3mm">Students see only their own information. A guardian can view it together with the student.</p>
  ${steps([["Notification", "“Your result is published”"], ["Open result", "Subject marks, GPA, grade, position"], ["Download report card", "PDF to keep or share with the guardian"], ["Stay informed", "Attendance, homework and notices"]])}
  <div style="display:grid;grid-template-columns:1fr 1fr 40mm;gap:4mm;align-items:start">${fig("student-result", 2, "Result on the web", 900)}${fig("student-dashboard", 4, "Student dashboard", 900)}<div>${phone("phone-result", "On a phone")}</div></div>
  <div class="note"><b>Guardians:</b> in this first release a guardian has no separate login. They see results through the student’s account or the report card PDF; guardian phone numbers are stored for school contact.</div>`)}
</body></html>`;
writeFileSync(path.join(dir, "flow.html"), html);
const { chromium } = await import("playwright");
const b = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.goto("file://" + path.join(dir, "flow.html")); await p.waitForTimeout(800);
await p.pdf({ path: path.join(dir, "ShikkhaOS-App-Flow.pdf"), format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
await b.close(); console.log("pages", n);
