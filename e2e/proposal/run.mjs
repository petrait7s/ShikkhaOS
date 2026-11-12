// Starts a throw-away stack (fresh DB, demo data, Rust API, Next.js) and runs capture.mjs to produce proposal screenshots.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PG = process.env.E2E_PG_URL ?? "postgres://postgres:postgres@localhost:5432";
const API_PORT = 18081, WEB_PORT = 13001, dbName = `proposal_${Date.now()}`;
const bin = ["apps/api/target/release/shikkhaos-api", "apps/api/target/debug/shikkhaos-api"].map((p) => path.join(root, p)).find(existsSync);
const env = { ...process.env, DATABASE_URL: `${PG}/${dbName}`, JWT_SECRET: "proposal-secret-proposal-secret-12345678", COOKIE_SECURE: "false", CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT}`, BIND_ADDR: `127.0.0.1:${API_PORT}`, ALLOW_DEMO_SEED: "true", STORAGE_DIR: path.join(root, "e2e", ".files-proposal"), RUST_LOG: "warn" };
const kids = [];
const run = (c, a, o = {}) => { const r = spawnSync(c, a, { stdio: "inherit", cwd: root, ...o }); if (r.status !== 0) throw new Error(`${c} ${a.join(" ")} failed`); };
const sql = (q) => run("psql", [`${PG}/postgres`, "-v", "ON_ERROR_STOP=1", "-c", q]);
const cleanup = () => { kids.forEach((k) => { try { k.kill("SIGTERM"); } catch { /* gone */ } }); try { sql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); } catch { /* best effort */ } };
async function waitFor(u) { for (let i = 0; i < 200; i++) { try { const r = await fetch(u); if (r.status < 500) return; } catch { /* wait */ } await sleep(300); } throw new Error("timeout " + u); }
let code = 1;
try {
  sql(`CREATE DATABASE ${dbName}`); run(bin, ["migrate"], { env }); run(bin, ["seed-demo"], { env });
  kids.push(spawn(bin, ["serve"], { env, stdio: "inherit" })); await waitFor(`http://127.0.0.1:${API_PORT}/api/v1/health`);
  if (!process.env.SKIP_WEB_BUILD) run("pnpm", ["--filter", "web", "build"], { env: { ...process.env, API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` } });
  kids.push(spawn("pnpm", ["--filter", "web", "exec", "next", "start", "-p", String(WEB_PORT), "-H", "127.0.0.1"], { env: process.env, stdio: "ignore", cwd: root })); await waitFor(`http://127.0.0.1:${WEB_PORT}/`);
  const r = spawnSync("node", ["e2e/proposal/capture.mjs"], { stdio: "inherit", cwd: root, env: { ...process.env, WEB: `http://127.0.0.1:${WEB_PORT}`, API: `http://127.0.0.1:${API_PORT}/api/v1` } });
  code = r.status ?? 1;
} catch (e) { console.error(e); }
cleanup(); process.exit(code);
