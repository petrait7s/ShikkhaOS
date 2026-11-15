// Builds docs/proposal/icon-styles.html: five icon styles for the 14 apps (no JavaScript).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const lucide = path.join(dir, "../../os-shell/node_modules/lucide-react/dist/esm/icons");
const icon = (name) => {
  const src = readFileSync(path.join(lucide, `${name}.js`), "utf8");
  const nodes = [...src.matchAll(/\[\s*"(\w+)",\s*\{([\s\S]*?)\}\s*\]/g)].map(([, tag, attrs]) => `<${tag} ${[...attrs.matchAll(/(\w+):\s*"([^"]*)"/g)].filter(([, k]) => k !== "key").map(([, k, v]) => `${k}="${v}"`).join(" ")}/>`);
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${nodes.join("")}</svg>`;
};
const APPS = [
  ["Results", "table-2", "#FFC15E", "#FF7A18"], ["Students", "graduation-cap", "#B7A3FF", "#6D4AFF"], ["Teachers", "presentation", "#6FF0DA", "#0E9F8E"],
  ["Classes", "layers-3", "#FF9DB0", "#F0436A"], ["Approvals", "shield-check", "#8BE79B", "#22A752"], ["Routine", "calendar-days", "#FFA6CE", "#E8458B"],
  ["Magazine", "book-open-text", "#F6A9E6", "#C026D3"], ["Notices", "megaphone", "#8EDBFF", "#1D8FE8"], ["Attendance", "calendar-check", "#74EBBF", "#0F9D6E"],
  ["Homework", "notebook-pen", "#FFE38A", "#F59E0B"], ["Messages", "message-square", "#7AEAF8", "#0891B2"], ["Audit", "scroll-text", "#CFC1FF", "#7C3AED"],
  ["Settings", "sliders-horizontal", "#D5DEE9", "#64748B"], ["Profile", "user-round", "#9FB2FF", "#4F5BD5"],
];
const STYLES = [
  ["A", "Flat gradient (macOS Big Sur)", "Clean squircle, soft gradient, white glyph. Calm and professional.", "a"],
  ["B", "Glossy candy (shown before)", "Shiny top highlight, deep colour. Playful.", "b"],
  ["C", "Soft tint (iOS 17 / Fluent)", "Pale tinted tile with a coloured glyph. Light and modern.", "c"],
  ["D", "Clay 3D", "Fat rounded tile, soft inner light and shadow, like moulded clay.", "d"],
  ["E", "Glass", "Frosted glass tile with a bright coloured glyph and glow.", "e"],
];
const cell = (a, k) => `<div class="app"><span class="ic ${k}" style="--c1:${a[2]};--c2:${a[3]}">${icon(a[1])}</span><b>${a[0]}</b></div>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShikkhaOS — icon styles</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet"><style>
:root{--navy:#0F172A;--muted:#475569;--line:rgba(15,23,42,.10)}*{box-sizing:border-box}
body{margin:0;font-family:Montserrat,system-ui,sans-serif;background:#F7F9FC;color:var(--navy);line-height:1.5}
header{padding:28px 20px 6px;max-width:1200px;margin:0 auto}h1{margin:0 0 6px;font-size:30px;letter-spacing:-.02em}p.l{margin:0;color:var(--muted);max-width:720px}
.bar{position:sticky;top:0;z-index:5;background:rgba(247,249,252,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);padding:10px 20px;overflow-x:auto;white-space:nowrap;margin-top:16px}.bar a{display:inline-block;margin-right:8px;padding:7px 14px;border-radius:99px;border:1px solid var(--line);background:#fff;color:inherit;text-decoration:none;font-weight:700;font-size:13px}
main{max-width:1200px;margin:0 auto;padding:10px 20px 60px}section{margin-top:34px;scroll-margin-top:60px}h2{font-size:22px;margin:0}h2 span{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--navy);color:#fff;font-size:16px;margin-right:10px}
.d{color:var(--muted);margin:4px 0 14px}.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:860px){.row{grid-template-columns:1fr}}
.panel{border-radius:24px;padding:22px 18px;border:1px solid var(--line)}.light{background:linear-gradient(165deg,#F9FBFD,#E3F1EE)}.dark{background:linear-gradient(165deg,#0B1220,#14233B);color:#F7F9FC}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:18px 8px}.app{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}.app b{font-size:12.5px;font-weight:700}
.dock{margin-top:18px;display:flex;gap:10px;justify-content:center;padding:12px;border-radius:26px;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.8);box-shadow:0 14px 30px rgba(15,23,42,.14);overflow-x:auto}.dark .dock{background:rgba(40,58,92,.6);border-color:rgba(220,239,235,.16)}
.ic{--s:62px;position:relative;display:grid;place-items:center;width:var(--s);height:var(--s);transition:transform .28s cubic-bezier(.2,.8,.2,1)}.app:hover .ic,.dock .ic:hover{transform:translateY(-6px) scale(1.12)}
.ic svg{position:relative;width:52%;height:52%;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:2}
/* A flat gradient */
.ic.a{border-radius:22.5%;background:linear-gradient(160deg,var(--c1),var(--c2));box-shadow:0 1px 2px rgba(0,0,0,.18),0 6px 12px color-mix(in srgb,var(--c2) 28%,transparent)}.ic.a svg{stroke:#fff;stroke-width:2.1}
/* B candy */
.ic.b{border-radius:23%;background:linear-gradient(180deg,var(--c1),var(--c2));box-shadow:inset 0 -7px 12px rgba(0,0,0,.2),inset 0 2px 0 rgba(255,255,255,.6),0 10px 18px color-mix(in srgb,var(--c2) 48%,transparent)}.ic.b::before{content:"";position:absolute;left:7%;right:7%;top:4%;height:46%;border-radius:50% 50% 42% 42%/80% 80% 28% 28%;background:linear-gradient(180deg,rgba(255,255,255,.72),rgba(255,255,255,.04))}.ic.b svg{stroke:#fff;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))}
/* C soft tint */
.ic.c{border-radius:24%;background:color-mix(in srgb,var(--c2) 14%,#fff);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c2) 22%,transparent),0 3px 8px rgba(15,23,42,.06)}.dark .ic.c{background:color-mix(in srgb,var(--c2) 26%,#1A2740)}.ic.c svg{stroke:var(--c2);stroke-width:2.2}.dark .ic.c svg{stroke:var(--c1)}
/* D clay */
.ic.d{border-radius:34%;background:radial-gradient(120% 120% at 30% 18%,var(--c1),var(--c2) 78%);box-shadow:inset 6px 7px 12px rgba(255,255,255,.45),inset -7px -9px 14px rgba(0,0,0,.22),0 10px 16px color-mix(in srgb,var(--c2) 40%,transparent),0 2px 0 rgba(255,255,255,.4)}.ic.d svg{stroke:#fff;stroke-width:2.6;filter:drop-shadow(0 3px 2px rgba(0,0,0,.28))}
/* E glass */
.ic.e{border-radius:28%;background:linear-gradient(145deg,color-mix(in srgb,var(--c1) 40%,transparent),color-mix(in srgb,var(--c2) 22%,transparent));backdrop-filter:blur(10px);border:1px solid color-mix(in srgb,var(--c1) 55%,#fff);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 22px color-mix(in srgb,var(--c2) 38%,transparent)}.ic.e svg{stroke:var(--c2);stroke-width:2.2;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--c1) 60%,transparent))}.dark .ic.e svg{stroke:#fff}
footer{text-align:center;color:var(--muted);font-size:13px;padding:10px 20px 50px}
</style></head><body><header><h1>Icon styles</h1><p class="l">Five ways to draw the app icons. Each is shown on a light and a dark background, in a grid and in the dock. Hover to see the lift. Tell me the letter you like (or mix, e.g. “A with the colours of B”).</p></header>
<div class="bar">${STYLES.map((s) => `<a href="#${s[3]}">${s[0]} · ${s[1].split(" (")[0]}</a>`).join("")}</div><main>
${STYLES.map((s) => `<section id="${s[3]}"><h2><span>${s[0]}</span>${s[1]}</h2><p class="d">${s[2]}</p><div class="row">
<div class="panel light"><div class="grid">${APPS.map((a) => cell(a, s[3])).join("")}</div><div class="dock">${APPS.slice(0, 9).map((a) => `<span class="ic ${s[3]}" style="--c1:${a[2]};--c2:${a[3]};--s:54px">${icon(a[1])}</span>`).join("")}</div></div>
<div class="panel dark"><div class="grid">${APPS.map((a) => cell(a, s[3])).join("")}</div><div class="dock">${APPS.slice(0, 9).map((a) => `<span class="ic ${s[3]}" style="--c1:${a[2]};--c2:${a[3]};--s:54px">${icon(a[1])}</span>`).join("")}</div></div></div></section>`).join("")}
</main><footer>Design preview only. petrait.site</footer></body></html>`;
writeFileSync(path.join(dir, "icon-styles.html"), html);
console.log((html.length / 1e3).toFixed(0) + " KB");
