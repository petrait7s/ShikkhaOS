// Builds docs/proposal/ui-preview.html: a design preview (no JavaScript) of the next UI pass.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const lucide = path.join(dir, "../../os-shell/node_modules/lucide-react/dist/esm/icons");
const icon = (name) => {
  const src = readFileSync(path.join(lucide, `${name}.js`), "utf8");
  const nodes = [...src.matchAll(/\[\s*"(\w+)",\s*\{([\s\S]*?)\}\s*\]/g)].map(([, tag, attrs]) => {
    const a = [...attrs.matchAll(/(\w+):\s*"([^"]*)"/g)].filter(([, k]) => k !== "key").map(([, k, v]) => `${k}="${v}"`).join(" ");
    return `<${tag} ${a}/>`;
  });
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${nodes.join("")}</svg>`;
};
const PETRA = `data:image/png;base64,${readFileSync(path.join(dir, "logo-mark.png")).toString("base64")}`;
const PETRA_LIGHT = `data:image/png;base64,${readFileSync(path.join(dir, "logo-mark-light.png")).toString("base64")}`;

// app id, label, bn, lucide icon, colour pair (top, bottom)
const APPS = [
  ["results", "Results", "ফলাফল", "table-2", "#FFC15E", "#FF7A18"],
  ["students", "Students", "শিক্ষার্থী", "graduation-cap", "#B7A3FF", "#6D4AFF"],
  ["teachers", "Teachers", "শিক্ষক", "presentation", "#6FF0DA", "#0E9F8E"],
  ["classes", "Classes", "শ্রেণি", "layers-3", "#FF9DB0", "#F0436A"],
  ["approvals", "Approvals", "অনুমোদন", "shield-check", "#8BE79B", "#22A752"],
  ["routine", "Routine", "রুটিন", "calendar-days", "#FFA6CE", "#E8458B"],
  ["magazine", "Magazine", "ম্যাগাজিন", "book-open-text", "#F6A9E6", "#C026D3"],
  ["notices", "Notices", "নোটিস", "megaphone", "#8EDBFF", "#1D8FE8"],
  ["attendance", "Attendance", "উপস্থিতি", "calendar-check", "#74EBBF", "#0F9D6E"],
  ["homework", "Homework", "বাড়ির কাজ", "notebook-pen", "#FFE38A", "#F59E0B"],
  ["messages", "Messages", "বার্তা", "message-square", "#7AEAF8", "#0891B2"],
  ["audit", "Audit", "অডিট", "scroll-text", "#CFC1FF", "#7C3AED"],
  ["settings", "Settings", "সেটিংস", "sliders-horizontal", "#D5DEE9", "#64748B"],
  ["profile", "Profile", "প্রোফাইল", "user-round", "#9FB2FF", "#4F5BD5"],
];
const candy = (a, sz = 64) => `<span class="candy" style="--c1:${a[4]};--c2:${a[5]};--sz:${sz}px">${icon(a[3])}</span>`;
const byId = Object.fromEntries(APPS.map((a) => [a[0], a]));
const dockIds = ["results", "students", "teachers", "classes", "approvals", "routine", "notices", "attendance", "homework", "messages", "audit", "settings", "profile"];

const css = `
:root{--navy:#0F172A;--navy2:#1B2742;--teal:#14B8A6;--ink2:#0F766E;--mint:#DCEFEB;--pearl:#F7F9FC;--muted:#475569;--line:rgba(15,23,42,.10);--card-a:#fff;--card-b:#EAF5F2;--fs:16px;--live:#14B8A6;
--depth:0 1px 1px rgba(15,23,42,.05),0 4px 8px rgba(15,23,42,.07),0 14px 28px rgba(15,23,42,.08);--depth2:0 2px 2px rgba(15,23,42,.06),0 10px 18px rgba(15,23,42,.12),0 26px 46px rgba(15,23,42,.14)}
.page:has(#dk:checked){--navy:#F7F9FC;--pearl:#0B1220;--muted:#A8B7CC;--line:rgba(220,239,235,.14);--card-a:#1C2B47;--card-b:#142039;--mint:#16263F}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Montserrat,Inter,"Segoe UI",system-ui,sans-serif;font-size:var(--fs);line-height:1.55}
.page{background:var(--pearl);color:var(--navy);min-height:100vh;transition:background .4s,color .4s}.page:has(#dk:checked){color:#F7F9FC}
.page:has(#dk:checked) .btn:not(.pri){color:#F7F9FC;background:linear-gradient(180deg,#2E4066,#1E2D4A);box-shadow:inset 0 1px 0 rgba(220,239,235,.16),0 0 0 .5px rgba(0,0,0,.5),0 4px 8px rgba(0,0,0,.3)}
.page:has(#dk:checked) .li em{background:rgba(20,184,166,.18);color:#7FF0DC}
.page:has(#dk:checked) .inp,.page:has(#dk:checked) .chip,.page:has(#dk:checked) .pill,.page:has(#dk:checked) .ib{background:#1C2B47}
.page:has(#dk:checked) .ib svg{stroke:#F7F9FC}
.bn{font-family:"Tiro Bangla",serif}
.bar{position:sticky;top:0;z-index:20;display:flex;gap:8px;align-items:center;padding:10px 18px;background:color-mix(in srgb,var(--pearl) 90%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);overflow-x:auto;white-space:nowrap}
.bar b{margin-right:8px}.bar a{padding:7px 13px;border-radius:999px;border:1px solid var(--line);text-decoration:none;color:inherit;font-size:13px;font-weight:650;background:var(--card-a)}.bar a:hover{border-color:var(--teal)}
.bar label{margin-left:auto;cursor:pointer;padding:7px 13px;border-radius:999px;border:1px solid var(--line);background:var(--card-a);font-size:13px;font-weight:650}#dk{position:absolute;opacity:0;pointer-events:none}
main{max-width:1320px;margin:0 auto;padding:28px 18px 80px}h2{font-size:26px;margin:46px 0 6px;letter-spacing:-.02em}.lead{color:var(--muted);max-width:760px;margin:0 0 18px}
.notes{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px;padding:0;list-style:none}.notes li{padding:6px 12px;border-radius:999px;background:var(--mint);font-size:13px;font-weight:650;color:var(--navy)}
.scroll{overflow-x:auto;padding-bottom:12px}
.stage{position:relative;width:1280px;height:980px;border-radius:22px;overflow:hidden;box-shadow:0 30px 70px rgba(15,23,42,.22);border:1px solid var(--line);isolation:isolate}
.stage.tall{height:960px}
/* background: layered mesh + soft rings + dot grid */
.bg{position:absolute;inset:0;z-index:-1;background:
 radial-gradient(46% 42% at 8% 6%,rgba(20,184,166,.38),transparent 70%),
 radial-gradient(40% 38% at 96% 10%,rgba(99,179,237,.28),transparent 72%),
 radial-gradient(50% 46% at 84% 100%,rgba(20,184,166,.30),transparent 72%),
 radial-gradient(34% 30% at 40% 78%,rgba(167,139,250,.16),transparent 72%),
 linear-gradient(165deg,#F9FBFD 0%,#E7F3F1 55%,#D5EBE6 100%)}
.bg::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(15,23,42,.10) 1px,transparent 1.4px);background-size:26px 26px;-webkit-mask-image:radial-gradient(70% 60% at 50% 40%,#000,transparent 80%);mask-image:radial-gradient(70% 60% at 50% 40%,#000,transparent 80%)}
.bg::after{content:"";position:absolute;width:760px;height:760px;right:-240px;top:-300px;border-radius:50%;border:1px solid rgba(15,23,42,.07);box-shadow:0 0 0 70px rgba(255,255,255,.18),0 0 0 140px rgba(255,255,255,.10)}
.page:has(#dk:checked) .bg{background:
 radial-gradient(46% 42% at 8% 6%,rgba(20,184,166,.40),transparent 70%),
 radial-gradient(40% 38% at 96% 10%,rgba(56,189,248,.18),transparent 72%),
 radial-gradient(50% 46% at 84% 100%,rgba(20,184,166,.28),transparent 72%),
 radial-gradient(34% 30% at 40% 78%,rgba(139,92,246,.20),transparent 72%),
 linear-gradient(165deg,#0B1220 0%,#0F1B33 60%,#12243C 100%)}
.page:has(#dk:checked) .bg::before{background-image:radial-gradient(rgba(220,239,235,.14) 1px,transparent 1.4px)}
.page:has(#dk:checked) .bg::after{border-color:rgba(220,239,235,.08);box-shadow:0 0 0 70px rgba(220,239,235,.03),0 0 0 140px rgba(220,239,235,.02)}
/* candy icons */
.candy{--sz:64px;position:relative;display:inline-grid;place-items:center;width:var(--sz);height:var(--sz);border-radius:23%;background:linear-gradient(180deg,var(--c1),var(--c2));box-shadow:inset 0 -7px 12px rgba(0,0,0,.20),inset 0 2px 0 rgba(255,255,255,.6),0 1px 1px rgba(0,0,0,.25),0 10px 18px color-mix(in srgb,var(--c2) 48%,transparent);transition:transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s}
.candy::before{content:"";position:absolute;left:7%;right:7%;top:4%;height:46%;border-radius:50% 50% 42% 42%/80% 80% 28% 28%;background:linear-gradient(180deg,rgba(255,255,255,.72),rgba(255,255,255,.04))}
.candy svg{position:relative;width:54%;height:54%;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 2px 2px rgba(0,0,0,.32))}
/* buttons / cards */
.btn{color:#0F172A;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:var(--h,48px);padding:0 22px;border:0;border-radius:14px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;background:linear-gradient(180deg,#fff,#E5F0EE);box-shadow:inset 0 1px 0 #fff,inset 0 -2px 0 rgba(15,23,42,.07),0 0 0 .5px rgba(15,23,42,.2),0 2px 4px rgba(15,23,42,.14),0 8px 14px rgba(15,23,42,.06);transition:transform .18s,box-shadow .18s}
.btn:hover{transform:translateY(-2px);box-shadow:inset 0 1px 0 #fff,0 0 0 .5px rgba(15,23,42,.2),0 0 0 4px rgba(20,184,166,.22),0 12px 20px rgba(15,23,42,.14)}.btn:active{transform:translateY(1px)}
.btn.pri{color:#fff;background:linear-gradient(180deg,#34456B,#0F172A 45%,#0A1020);box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 0 0 .5px #000,0 3px 0 #05080f,0 10px 18px rgba(15,23,42,.35);margin-bottom:3px}
.btn.pri:hover{box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 0 0 .5px #000,0 3px 0 #05080f,0 0 0 5px rgba(20,184,166,.28),0 14px 24px rgba(15,23,42,.4)}
.card{position:relative;overflow:hidden;border-radius:22px;padding:22px 24px;background:linear-gradient(155deg,var(--card-a),var(--card-b));border:1px solid color-mix(in srgb,var(--line) 78%,var(--live) 22%);box-shadow:var(--depth),inset 0 1px 0 rgba(255,255,255,.9);transition:transform .32s cubic-bezier(.2,.8,.2,1),box-shadow .32s}
.card::before{content:"";position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,var(--live),transparent 75%)}
.card:hover{transform:translateY(-4px);box-shadow:var(--depth2),0 0 0 1px color-mix(in srgb,var(--live) 38%,transparent)}
.card h3{margin:0 0 12px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
/* login */
.login{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:30px 0 96px}
.badge{position:relative;display:grid;place-items:center;width:104px;height:104px;border-radius:28px;color:#fff;font-weight:800;font-size:38px;letter-spacing:-.02em;background:linear-gradient(150deg,#1D2F57 0%,#0F172A 55%,#0B7C70 140%);box-shadow:inset 0 2px 0 rgba(255,255,255,.28),0 0 0 6px rgba(20,184,166,.18),0 18px 36px rgba(15,23,42,.35)}
.badge::after{content:"";position:absolute;left:8%;right:8%;top:5%;height:42%;border-radius:50% 50% 40% 40%/80% 80% 30% 30%;background:linear-gradient(180deg,rgba(255,255,255,.35),transparent)}
.login h1{margin:20px 0 2px;font-size:34px;letter-spacing:-.025em}.login .bn{font-size:20px;color:var(--muted);margin:0}.motto{margin:8px 0 22px;font-size:15px;font-weight:600;color:var(--ink2);letter-spacing:.01em}
.glass{width:500px;border-radius:30px;padding:34px 36px;background:linear-gradient(160deg,rgba(255,255,255,.92),rgba(236,247,244,.84));backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.9);box-shadow:0 30px 60px rgba(15,23,42,.18),inset 0 1px 0 #fff}
.page:has(#dk:checked) .glass{background:linear-gradient(160deg,rgba(28,43,71,.92),rgba(20,32,57,.88));border-color:rgba(220,239,235,.14)}
.glass h2{margin:0 0 18px;font-size:26px}.lbl{display:block;font-size:14px;font-weight:700;color:var(--muted);margin:0 0 7px}
.inp{height:56px;border-radius:16px;margin-bottom:16px;background:var(--card-a);box-shadow:inset 0 2px 4px rgba(15,23,42,.08),0 0 0 .5px rgba(15,23,42,.18);transition:box-shadow .2s}.inp:hover{box-shadow:inset 0 2px 4px rgba(15,23,42,.08),0 0 0 3px rgba(20,184,166,.28)}
.row{display:flex;justify-content:space-between;font-size:14px;margin:16px 0 4px}.row a{color:var(--ink2);font-weight:650}
.enter{margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}.enter small{display:block;font-size:12px;letter-spacing:.14em;font-weight:800;color:var(--muted);margin-bottom:12px}
.chips{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.chip{display:flex;flex-direction:column;align-items:center;gap:7px;padding:12px 4px 10px;border-radius:16px;font-size:13px;font-weight:700;background:var(--card-a);border:1px solid var(--line);box-shadow:var(--depth);transition:transform .25s,box-shadow .25s}.chip:hover{transform:translateY(-4px);box-shadow:var(--depth2)}
.foot{position:absolute;left:0;right:0;bottom:22px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:14px;color:var(--muted)}.foot img{height:30px}.foot b{color:var(--navy)}
/* home */
.top{display:flex;align-items:center;gap:14px;height:68px;padding:0 24px;background:color-mix(in srgb,var(--card-a) 80%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}
.mini{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;color:#fff;font-weight:800;font-size:15px;background:linear-gradient(150deg,#1D2F57,#0F172A 60%,#0B7C70 150%);box-shadow:0 4px 10px rgba(15,23,42,.3)}
.top .name{font-weight:800;font-size:17px;letter-spacing:-.01em}.top .sp{flex:1}.pill{display:flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:999px;background:var(--card-a);border:1px solid var(--line);font-size:14px;color:var(--muted);min-width:280px}
.av{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:linear-gradient(160deg,#B7A3FF,#6D4AFF);color:#fff;font-weight:800;box-shadow:0 4px 10px rgba(109,74,255,.4)}
.ib{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:var(--card-a);border:1px solid var(--line);position:relative}.ib svg{width:20px;height:20px;fill:none;stroke:var(--navy);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.ib i{position:absolute;top:-5px;right:-5px;background:#D92D20;color:#fff;border-radius:99px;font-size:11px;font-style:normal;font-weight:800;padding:1px 6px}
.wrap{padding:22px 28px 0;display:grid;gap:18px}
.hero{position:relative;overflow:hidden;border-radius:28px;padding:28px 34px;color:#fff;background:radial-gradient(60% 120% at 100% 0%,rgba(45,212,191,.55),transparent 60%),linear-gradient(120deg,#0F172A 0%,#16335A 60%,#0B7C70 130%);box-shadow:0 24px 44px rgba(15,23,42,.30),inset 0 1px 0 rgba(255,255,255,.2);display:flex;align-items:center;gap:28px}
.hero::after{content:"";position:absolute;right:-60px;bottom:-120px;width:340px;height:340px;border-radius:50%;border:1px solid rgba(255,255,255,.18);box-shadow:0 0 0 40px rgba(255,255,255,.04),0 0 0 80px rgba(255,255,255,.03)}
.hero h2{margin:0;font-size:32px;letter-spacing:-.025em;color:#fff}.hero p{margin:6px 0 0;color:#C9F3EC;font-size:16px}.hero small{display:block;letter-spacing:.14em;font-weight:800;font-size:12px;color:#7FF0DC;margin-bottom:6px}
.stats{margin-left:auto;display:flex;gap:12px;position:relative;z-index:1}.stat{min-width:116px;padding:12px 16px;border-radius:18px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(8px)}.stat b{display:block;font-size:28px;line-height:1.1}.stat span{font-size:13px;color:#C9F3EC}
.cols{display:grid;grid-template-columns:1.55fr 1fr 1fr;gap:18px}
.li{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);font-size:15px}.li:last-child{border:0}.dot{width:10px;height:10px;border-radius:50%;flex:none}.li em{margin-left:auto;font-style:normal;font-size:12px;font-weight:800;padding:3px 10px;border-radius:99px;background:var(--mint);color:var(--ink2)}
.nums{display:grid;grid-template-columns:repeat(3,1fr);text-align:center}.nums b{display:block;font-size:34px;line-height:1.1}.nums span{font-size:13px;color:var(--muted)}
.ring{flex:none;width:112px;height:112px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--live) 0 73%,rgba(15,23,42,.10) 0);position:relative}.ring::after{content:"73%";position:absolute;inset:11px;border-radius:50%;display:grid;place-items:center;background:var(--card-a);font-weight:800;font-size:22px}
.dock{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);display:flex;align-items:flex-end;gap:12px;padding:12px 16px;border-radius:30px;background:linear-gradient(180deg,rgba(255,255,255,.62),rgba(255,255,255,.34));backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.75);box-shadow:0 22px 50px rgba(15,23,42,.28),inset 0 1px 0 #fff}
.page:has(#dk:checked) .dock{background:linear-gradient(180deg,rgba(40,58,92,.7),rgba(20,32,57,.5));border-color:rgba(220,239,235,.16)}
.dock a{display:block;transition:transform .25s cubic-bezier(.2,.8,.2,1)}.dock a:hover{transform:translateY(-14px) scale(1.4)}.dock a:hover+a,.dock a:has(+a:hover){transform:translateY(-7px) scale(1.18)}
/* icon sheet */
.sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;margin-top:14px}.sheet .card{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:22px 10px 16px}.sheet .card::before{display:none}.sheet b{font-size:15px}.sheet small{color:var(--muted)}.sheet .card:hover .candy{transform:translateY(-4px) rotate(-3deg) scale(1.08)}
.cmp{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:14px}.cmp .card::before{display:none}.old{display:flex;gap:10px;flex-wrap:wrap}.old>span:not(.candy){display:grid;place-items:center;width:50px;height:50px;border-radius:13px;color:#fff;background:linear-gradient(180deg,#136F66,#0B4F49);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 4px 8px rgba(15,23,42,.25)}.old>span:not(.candy) svg{width:26px;height:26px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.old>span:not(.candy):nth-child(3n){background:linear-gradient(180deg,#223760,#0F172A)}
/* fonts */
.type p{margin:0}.t1{font-size:14.5px}.t2{font-size:16px;font-weight:600}.sz{display:grid;grid-template-columns:140px 1fr;gap:6px 18px;align-items:baseline}.sz span{color:var(--muted);font-size:13px}
/* phones */
.phones{display:flex;gap:30px;flex-wrap:wrap;justify-content:center;margin-top:18px}.phone{width:340px;height:800px;border-radius:44px;padding:11px;background:#0F172A;box-shadow:0 26px 54px rgba(15,23,42,.35)}.screen{position:relative;height:100%;border-radius:34px;overflow:hidden;isolation:isolate;display:flex;flex-direction:column}
.screen .bg::after{display:none}.m-login{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 16px 56px}.m-login .badge{width:76px;height:76px;font-size:27px;border-radius:21px}.m-login h1{font-size:23px;margin:12px 0 0;text-align:center;line-height:1.2}.m-login .bn{font-size:16px}.m-login .motto{font-size:13px;text-align:center;margin:6px 0 16px}
.m-login .glass{width:100%;padding:22px 20px;border-radius:24px}.m-login .glass h2{font-size:20px;margin-bottom:12px}.m-login .inp{height:50px;margin-bottom:12px}.m-login .btn{width:100%}.m-login .chips{gap:6px}.m-login .chip{font-size:11px;padding:8px 2px}.m-login .chip .candy{--sz:34px!important}
.m-foot{position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center;align-items:center;gap:8px;font-size:12px;color:var(--muted)}.m-foot img{height:22px}
.m-bar{display:flex;align-items:center;gap:10px;height:60px;padding:0 16px;background:color-mix(in srgb,var(--card-a) 85%,transparent);border-bottom:1px solid var(--line);font-weight:800;font-size:19px}
.m-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:16px 12px;flex:1;align-content:start}.m-tile{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;padding:14px 2px 10px;border-radius:20px;font-size:13px;font-weight:700;text-align:center;background:linear-gradient(160deg,var(--card-a),color-mix(in srgb,var(--c2) 10%,var(--card-b)));box-shadow:var(--depth),inset 0 1px 0 rgba(255,255,255,.9);border:1px solid var(--line);transition:transform .25s}.m-tile:hover{transform:translateY(-4px)}
.m-nav{display:grid;grid-template-columns:repeat(4,1fr);padding:8px 8px 14px;background:color-mix(in srgb,var(--card-a) 94%,transparent);border-top:1px solid var(--line);font-size:12px;font-weight:700;text-align:center;color:var(--muted)}.m-nav div{padding:8px 0;border-radius:16px}.m-nav .on{background:rgba(20,184,166,.18);color:var(--navy);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 0 0 1px rgba(20,184,166,.3)}.m-nav svg{display:block;margin:0 auto 3px;width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.step{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.step span{padding:10px 16px;border-radius:14px;background:var(--navy);color:var(--pearl);font-weight:700;font-size:14px}
footer{text-align:center;color:var(--muted);font-size:13px;padding:30px 20px}
`;

const role = (name, ids, color) => `<div class="chip">${candy(byId[ids], 40).replace("--sz:40px", `--sz:40px`)}${name}</div>`;
const roleChips = `<div class="chips">
<div class="chip">${candy(byId.approvals, 44)}Headmaster</div>
<div class="chip">${candy(byId.results, 44)}Registrar</div>
<div class="chip">${candy(byId.teachers, 44)}Teacher</div>
<div class="chip">${candy(byId.students, 44)}Student</div></div>`;

const loginInner = `<div class="bg"></div><div class="login">
<div class="badge">GC</div><h1>Green Crescent Model School</h1><p class="bn">গ্রিন ক্রিসেন্ট মডেল স্কুল</p><p class="motto">“One School. One System. One Connected Community.”</p>
<div class="glass"><h2>Sign in</h2><label class="lbl">Student ID, phone or email</label><div class="inp"></div><label class="lbl">Password</label><div class="inp"></div>
<button class="btn pri" style="width:100%;--h:56px;font-size:17px">Sign in</button><div class="row"><a>Forgot password?</a><a>Verified sign-up</a></div>
<div class="enter"><small>ENTER AS…</small>${roleChips}</div></div></div>
<div class="foot"><img src="${PETRA}" alt=""><span>Powered by <b>Petra</b></span><span>· ShikkhaOS v1.3</span></div>`;

const dock = `<nav class="dock">${dockIds.map((id) => `<a href="#icons" title="${byId[id][1]}">${candy(byId[id], 62)}</a>`).join("")}</nav>`;
const sheet = APPS.map((a) => `<div class="card">${candy(a, 76)}<b>${a[1]}</b><small class="bn">${a[2]}</small></div>`).join("");
const oldIcons = ["table-2", "graduation-cap", "presentation", "layers-3", "shield-check", "calendar-days", "book-open-text", "megaphone", "scroll-text", "sliders-horizontal", "user-round"].map((n) => `<span>${icon(n)}</span>`).join("");
const tab = (n, label, on) => `<div class="${on ? "on" : ""}">${icon(n)}${label}</div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShikkhaOS — UI preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Tiro+Bangla&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div class="page"><input type="checkbox" id="dk">
<div class="bar"><b>ShikkhaOS · UI preview</b><a href="#login">Login</a><a href="#home">Home</a><a href="#icons">Icons</a><a href="#mobile">Mobile</a><a href="#type">Fonts</a><label for="dk">☾ Dark / Light</label></div>
<main>
<h2 id="login" style="margin-top:0">1. Login</h2>
<p class="lead">Bigger. School logo, name and motto on top. Petra moves to the footer. Richer background.</p>
<ul class="notes"><li>Card 500 px (was 420)</li><li>Inputs and buttons 56 px</li><li>School badge + name + Bangla name + motto</li><li>“Powered by Petra” footer</li><li>Role chips with candy icons</li></ul>
<div class="scroll"><div class="stage">${loginInner}</div></div>

<h2 id="home">2. First page (Home)</h2>
<p class="lead">Organised top to bottom: top bar, greeting hero with key numbers, then three even columns that use the full width. Nothing floats in empty space.</p>
<ul class="notes"><li>Full-width hero with live numbers</li><li>Grid fills the screen (no empty right side)</li><li>Candy dock — hover it to magnify</li><li>Bigger type</li></ul>
<div class="scroll"><div class="stage tall"><div class="bg"></div>
<div class="top"><div class="mini">GC</div><span class="name">Green Crescent Model School</span><span class="sp"></span><div class="pill">${icon("search").replace("<svg", '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"')} Search students, notices, exams…</div><div class="ib">${icon("bell")}<i>20</i></div><div class="av">MA</div></div>
<div class="wrap">
<div class="hero"><div><small>EXAM WEEK</small><h2>Good evening, Md. Abdul Karim</h2><p>Marks entry and verification are the focus this week.</p></div>
<div class="stats"><div class="stat"><b>450</b><span>Students</span></div><div class="stat"><b>28</b><span>Teachers</span></div><div class="stat"><b>46%</b><span>Marks verified</span></div><div class="stat"><b>2</b><span>Published</span></div></div></div>
<div class="cols">
<div class="card"><h3>Action Center · 20</h3>
<div class="li"><span class="dot" style="background:#D92D20"></span>Ready to publish: Class 8-A · Annual<em>Now</em></div>
<div class="li"><span class="dot" style="background:#F59E0B"></span>Review 3 submitted sheets: Class 9-A<em>Today</em></div>
<div class="li"><span class="dot" style="background:#F59E0B"></span>Review 5 submitted sheets: Class 6-A<em>Today</em></div>
<div class="li"><span class="dot" style="background:#14B8A6"></span>New sign-ups waiting approval (5)<em>Soon</em></div></div>
<div class="card"><h3>Publish queue</h3><div class="nums"><div><b style="color:#0F766E">1</b><span>Ready</span></div><div><b>0</b><span>Scheduled</span></div><div><b>2</b><span>Published</span></div></div>
<div style="margin-top:18px;text-align:center"><button class="btn pri">Open Results Center</button></div></div>
<div class="card"><h3>Student onboarding</h3><div style="display:flex;align-items:center;gap:18px"><div class="ring"></div><span style="font-size:15px;color:var(--muted)">of students have claimed their accounts</span></div></div>
</div>
<div class="cols">
<div class="card"><h3>Today’s notices</h3><div class="li"><b>Result Day Announcement</b><em>14 Nov</em></div><div class="li"><b>Marks Submission Deadline</b><em>13 Nov</em></div><div class="li"><b>Annual Examination Routine</b><em>12 Nov</em></div></div>
<div class="card"><h3>Pending approvals</h3><div style="font-size:44px;font-weight:800;line-height:1">5</div><span style="color:var(--muted)">sign-ups waiting</span></div>
<div class="card"><h3>Quick actions</h3><div style="display:grid;gap:10px"><button class="btn" style="--h:46px">Import marks from Excel</button><button class="btn" style="--h:46px">Compose a notice</button></div></div>
</div></div>
${dock}</div></div>

<h2 id="icons">3. Menu and dock icons</h2>
<p class="lead">Glossy “candy” icons, one colour per app, like macOS. Hover the dock above or any icon below. The rest of the interface stays navy and teal.</p>
<div class="cmp"><div class="card"><h3>Now</h3><div class="old">${oldIcons}</div></div><div class="card"><h3>Proposed</h3><div class="old" style="gap:12px">${APPS.slice(0, 11).map((a) => candy(a, 50)).join("")}</div></div></div>
<div class="sheet">${sheet}</div>

<h2 id="mobile">4. Mobile (Android)</h2>
<p class="lead">Same login, bigger touch targets. Menu uses the candy icons.</p>
<div class="phones">
<div class="phone"><div class="screen"><div class="bg"></div><div class="m-login"><div class="badge">GC</div><h1>Green Crescent Model School</h1><p class="bn">গ্রিন ক্রিসেন্ট মডেল স্কুল</p><p class="motto">“One School. One System. One Connected Community.”</p>
<div class="glass"><h2>Sign in</h2><label class="lbl">Student ID, phone or email</label><div class="inp"></div><label class="lbl">Password</label><div class="inp"></div><button class="btn pri">Sign in</button><div class="enter" style="margin-top:12px;padding-top:12px"><small>ENTER AS…</small><div class="chips"><div class="chip">${candy(byId.approvals, 34)}Head</div><div class="chip">${candy(byId.results, 34)}Reg.</div><div class="chip">${candy(byId.teachers, 34)}Teacher</div><div class="chip">${candy(byId.students, 34)}Student</div></div></div></div></div>
<div class="m-foot"><img src="${PETRA}" alt=""><span>Powered by <b>Petra</b></span></div></div></div>
<div class="phone"><div class="screen"><div class="bg"></div><div class="m-bar"><div class="mini" style="width:34px;height:34px;font-size:13px">GC</div>Menu</div>
<div class="m-grid">${APPS.slice(0, 12).map((a) => `<div class="m-tile" style="--c2:${a[5]}">${candy(a, 58)}${a[1]}</div>`).join("")}</div>
<div class="m-nav">${tab("house", "Home")}${tab("layout-grid", "Menu", true)}${tab("bell", "Alerts")}${tab("user-round", "Me")}</div></div></div>
</div>

<h2 id="type">5. Fonts and background</h2>
<p class="lead">About 10% larger across the board. Menu and card text move from 14.5 px to 16 px; small labels from 12 px to 13 px; table text from 13 px to 14.5 px; mobile inputs stay 16 px.</p>
<div class="cmp type"><div class="card"><h3>Before</h3><p class="t1">Review 3 submitted sheet(s): Class 9-A<br>Marks entry and verification are the focus this week.</p></div>
<div class="card"><h3>After</h3><p class="t2">Review 3 submitted sheet(s): Class 9-A<br>Marks entry and verification are the focus this week.</p></div></div>
<p class="lead" style="margin-top:18px">Background: layered teal, sky and soft violet glows, a faint dot grid fading from the centre, and large soft rings. Use the Dark / Light switch at the top to compare both.</p>
</main><footer>Design preview only. Nothing here is applied to the app yet. petrait.site</footer></div></body></html>`;
writeFileSync(path.join(dir, "ui-preview.html"), html);
console.log((html.length / 1e3).toFixed(0) + " KB");
