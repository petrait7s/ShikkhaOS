// Builds docs/proposal/mobile-demo.html (single file, no JavaScript) from mobile-shots/*.jpg
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const img = (f) => `data:image/jpeg;base64,${readFileSync(path.join(dir, "mobile-shots", f)).toString("base64")}`;
const logo = `data:image/png;base64,${readFileSync(path.join(dir, "logo-mark-light.png")).toString("base64")}`;
const shots = [
  ["01-login.jpg", "Sign in", "লগইন", "Demo build: one tap per role."],
  ["02-home-teacher.jpg", "Home (Teacher)", "হোম", "Quick-app chips on top, then today’s work cards."],
  ["03-apps.jpg", "Apps", "অ্যাপ", "Big touch tiles. Only the apps this role may use."],
  ["04-marks-entry.jpg", "App page", "অ্যাপের পাতা", "Full screen with a back arrow. Bottom tabs hide."],
  ["05-alerts.jpg", "Alerts", "অ্যালার্ট", "Everything that needs attention, with a count badge."],
  ["06-me.jpg", "Me", "আমি", "Profile, language, dark mode, lock, sign out."],
  ["07-home-headmaster.jpg", "Home (Headmaster)", "হোম (প্রধান শিক্ষক)", "School overview and the results waiting for a decision."],
  ["08-results-center.jpg", "Results Center", "রেজাল্ট সেন্টার", "Class by subject status; Publish all ready classes."],
  ["09-home-student.jpg", "Home (Student)", "হোম (ছাত্র)", "Own result, notices and classes only."],
  ["10-my-results.jpg", "My Results", "আমার ফলাফল", "Published exams with grade and position."],
  ["11-home-bangla.jpg", "Bangla", "বাংলা", "Whole interface switches language (Tiro Bangla font)."],
  ["12-dark-home.jpg", "Dark mode", "ডার্ক মোড", "Navy surfaces, teal highlights."],
];
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShikkhaOS — Android app demo</title><style>
:root{--navy:#0F172A;--teal:#14B8A6;--ink2:#0F766E;--mint:#DCEFEB;--pearl:#F7F9FC;--muted:#475569;--line:#D6E3E1}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:16px/1.55 Montserrat,Inter,"Segoe UI",system-ui,sans-serif;background:var(--pearl);color:var(--navy)}
header.hero{background:var(--navy);color:#fff;padding:36px 20px 44px;position:relative;overflow:hidden}header.hero::before{content:"";position:absolute;width:520px;height:520px;right:-160px;top:-220px;background:radial-gradient(circle,rgba(20,184,166,.5),rgba(20,184,166,0) 65%)}
.wrap{max-width:1080px;margin:0 auto;position:relative}.brand{display:flex;align-items:center;gap:10px;font-weight:700}.brand img{height:30px}
h1{font-size:clamp(28px,5vw,44px);line-height:1.1;margin:22px 0 10px;letter-spacing:-.02em}.sub{color:var(--mint);max-width:620px;margin:0}
nav.jump{position:sticky;top:0;z-index:5;background:rgba(247,249,252,.94);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);overflow-x:auto;white-space:nowrap}
nav.jump .wrap{display:flex;gap:6px;padding:8px 20px}nav.jump a{flex:none;padding:7px 12px;border-radius:999px;font-size:13px;font-weight:650;color:var(--navy);text-decoration:none;border:1px solid var(--line);background:#fff}nav.jump a:hover{border-color:var(--teal)}
main{padding:28px 20px 60px}h2{font-size:22px;margin:40px 0 6px;letter-spacing:-.01em}h2:first-child{margin-top:0}p{margin:0 0 12px;color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:16px 0}.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px}.card b{display:block;margin-bottom:4px}.card.mint{background:var(--mint);border-color:transparent}
.flow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}.flow span{background:var(--navy);color:#fff;border-radius:999px;padding:8px 14px;font-size:14px;font-weight:650}.flow i{font-style:normal;color:var(--ink2);font-weight:800}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:30px 22px;margin-top:18px}
figure{margin:0;scroll-margin-top:70px}.phone{background:var(--navy);border-radius:38px;padding:9px;box-shadow:0 18px 40px rgba(15,23,42,.22);max-width:300px;margin:0 auto}
.phone img{display:block;width:100%;height:auto;border-radius:30px}figcaption{max-width:300px;margin:12px auto 0;text-align:center}figcaption b{display:block}figcaption em{display:block;font-style:normal;color:var(--ink2);font-size:13px;font-weight:600}figcaption span{display:block;font-size:14px;color:var(--muted);margin-top:2px}
.note{border-left:4px solid var(--teal);background:var(--mint);border-radius:0 12px 12px 0;padding:12px 16px;margin:16px 0;color:var(--navy)}
footer{text-align:center;color:var(--muted);font-size:13px;padding:0 20px 40px}
</style></head><body>
<header class="hero"><div class="wrap"><div class="brand"><img src="${logo}" alt=""><span>ShikkhaOS</span></div><h1>The Android app</h1><p class="sub">A phone-first layout: bottom tabs, full-screen pages and a back button that behaves. Screens below are from the demo build with sample data.</p></div></header>
<nav class="jump"><div class="wrap"><a href="#changes">What changed</a><a href="#back">Back button</a><a href="#screens">Screens</a></div></nav>
<main><div class="wrap">
<h2 id="changes">What changed</h2>
<div class="cards">
<div class="card"><b>Not a desktop on a phone</b>No floating windows or dock. Four bottom tabs: Home, Apps, Alerts, Me.</div>
<div class="card"><b>Pages, not windows</b>Open an app and it fills the screen with a back arrow at the top. The tabs hide while you work.</div>
<div class="card"><b>Made for thumbs</b>Large buttons (44 px), big app tiles, safe space for the status bar and gesture bar.</div>
<div class="card mint"><b>Same rules, same data</b>Each role sees only its own apps. Bangla, dark mode and the brand colours carry over.</div>
</div>
<h2 id="back">Back button</h2>
<p>Before, pressing Android’s back button inside an app closed the whole app. Now each press does one sensible step:</p>
<div class="flow"><span>1 Close a pop-up</span><i>→</i><span>2 Leave the open page</span><i>→</i><span>3 Go to Home tab</span><i>→</i><span>4 Exit the app</span></div>
<div class="note">Home is the only place where back leaves the app.</div>
<h2 id="screens">Screens</h2>
<div class="grid">
${shots.map(([f, t, bn, d], i) => `<figure id="s${i + 1}"><div class="phone"><img loading="lazy" src="${img(f)}" alt="${t}"></div><figcaption><b>${i + 1}. ${t}</b><em>${bn}</em><span>${d}</span></figcaption></figure>`).join("\n")}
</div>
</div></main>
<footer>Demo data only. petrait.site</footer>
</body></html>`;
writeFileSync(path.join(dir, "mobile-demo.html"), html);
console.log((html.length / 1e6).toFixed(1) + " MB");
