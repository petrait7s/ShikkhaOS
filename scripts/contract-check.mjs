// Contract check: (1) docs/api/openapi.yaml matches the Rust router (no drift), (2) every API path the TypeScript clients call exists in it.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { buildSpec, extractRoutes } from "./openapi-lib.mjs";

let failed = 0; const fail = (m) => { console.error("✗", m); failed++; };
const routes = extractRoutes();
if (routes.length < 100) fail(`only ${routes.length} routes extracted — route parser is broken`);
const committed = existsSync("docs/api/openapi.yaml") ? readFileSync("docs/api/openapi.yaml", "utf8") : "";
if (committed !== buildSpec(routes)) fail("docs/api/openapi.yaml is out of date. Run: node scripts/gen-openapi.mjs");

const specPaths = [...new Set(routes.map((r) => r.path))].map((p) => p.split("/"));
// Segment-wise match: "ID" (an interpolated value in client code) matches any spec segment; "{x}" matches any client segment.
const spec = (urlPath) => specPaths.some((sp) => { const u = urlPath.split("/"); return sp.length === u.length && sp.every((seg, i) => /^\{\w+\}$/.test(seg) || u[i] === "ID" || seg === u[i]); });
const tops = new Set(routes.map((r) => "/" + r.path.split("/")[1]));

function* walk(dir) { for (const f of readdirSync(dir)) { if (["node_modules", ".next", "dist", ".expo", "android", "release"].includes(f)) continue; const p = path.join(dir, f); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.(ts|tsx)$/.test(p) && !/\.test\./.test(p)) yield p; } }
let checked = 0; const seen = new Set();
for (const root of ["packages/screens/src", "packages/api-client/src", "apps/mobile/app", "apps/mobile/lib", "apps/desktop/src", "apps/web/src"]) {
  if (!existsSync(root)) continue;
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/(["'`])(\/[a-z][a-z0-9-]*(?:\/(?:\$\{[^}]+\}|[A-Za-z0-9_-]+))*)\1/g)) {
      let url = m[2].replace(/\$\{[^}]+\}/g, "ID");
      const top = "/" + url.split("/")[1];
      if (!tops.has(top)) continue;           // not an API path (route links, css, etc.)
      if (/^\/(students|exams|marks|review|results|messages|notices|homework|documents|reports|audit|attendance|class-tests|notifications|permissions|teachers|settings|moderation|academics|profile)(\/|$)/.test(url) && file.includes("app.tsx") && !/api\./.test(src.slice(Math.max(0, m.index - 40), m.index))) { /* UI route, not an API call */ }
      if (seen.has(url)) continue; seen.add(url);
      const ctx = src.slice(Math.max(0, m.index - 60), m.index);
      if (!/(api\.|\.(get|post|put|patch|del|page|all|upload|raw)<?[^(]*\(|useGet|useList|usePagedList)/.test(ctx) ) continue;
      if (/(navigate|NavLink|Link|to=|href|route\()/.test(ctx) && !/api\./.test(ctx)) continue; // UI navigation
      if (/invalidate\s*:/.test(ctx)) continue; // cache-prefix, not a request
      checked++;
      if (!spec(url)) fail(`${file}: API path ${m[2]} is not served by the backend`);
    }
  }
}
console.log(`${routes.length} backend operations; ${checked} client API paths checked.`);
if (failed) { console.error(`${failed} problem(s)`); process.exit(1); }
console.log("contract check passed");
