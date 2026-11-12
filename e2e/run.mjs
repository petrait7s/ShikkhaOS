// End-to-end runner: fresh PostgreSQL database -> migrate + demo seed -> Rust API -> Next.js web -> Playwright tests.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PG = process.env.E2E_PG_URL ?? "postgres://postgres:postgres@localhost:5432";
const API_PORT = 18080, WEB_PORT = 13000;
const dbName = `e2e_${Date.now()}`;
const bin = process.env.API_BIN ?? [ "apps/api/target/release/shikkhaos-api", "apps/api/target/debug/shikkhaos-api" ].map((p) => path.join(root, p)).find(existsSync);
if (!bin) { console.error("API binary not found. Build it: cargo build --manifest-path apps/api/Cargo.toml --bin shikkhaos-api"); process.exit(2); }
const env = { ...process.env, DATABASE_URL: `${PG}/${dbName}`, JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234", COOKIE_SECURE: "false", CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT}`, BIND_ADDR: `127.0.0.1:${API_PORT}`, ALLOW_DEMO_SEED: "true", STORAGE_DIR: path.join(root, "e2e", ".files"), RUST_LOG: "warn" };
const children = [];
const run = (cmd, args, opts = {}) => { const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`); };
const sql = (q) => run("psql", [`${PG}/postgres`, "-v", "ON_ERROR_STOP=1", "-c", q]);
const cleanup = () => { children.forEach((c) => { try { c.kill("SIGTERM"); } catch { /* gone */ } }); try { sql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); } catch { /* best effort */ } };
process.on("exit", cleanup); process.on("SIGINT", () => process.exit(130));

async function waitFor(url, ms = 60000) { const t = Date.now(); while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not up yet */ } await sleep(300); } throw new Error(`timeout waiting for ${url}`); }

try {
  sql(`CREATE DATABASE ${dbName}`);
  run(bin, ["migrate"], { env }); run(bin, ["seed-demo"], { env });
  children.push(spawn(bin, ["serve"], { env, stdio: "inherit", cwd: root }));
  await waitFor(`http://127.0.0.1:${API_PORT}/api/v1/health`);
  if (!process.env.E2E_SKIP_WEB_BUILD) run("pnpm", ["--filter", "web", "build"], { env: { ...process.env, API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}`, NEXT_PUBLIC_API_MODE: "live" } });
  children.push(spawn("pnpm", ["--filter", "web", "exec", "next", "start", "-p", String(WEB_PORT), "-H", "127.0.0.1"], { env: process.env, stdio: "inherit", cwd: root }));
  await waitFor(`http://127.0.0.1:${WEB_PORT}/`);
  const r = spawnSync("node", ["--test", "--test-concurrency=1", "--test-timeout=240000", ...(process.env.E2E_FILTER ? ["--test-name-pattern", process.env.E2E_FILTER] : []), "e2e/tests/workflow.test.mjs"], { stdio: "inherit", cwd: root, env: { ...process.env, E2E_WEB: `http://127.0.0.1:${WEB_PORT}`, E2E_API: `http://127.0.0.1:${API_PORT}/api/v1`, E2E_DB: `${PG}/${dbName}` } });
  process.exitCode = r.status ?? 1;
} catch (e) { console.error(e); process.exitCode = 1; }
cleanup();
process.exit(process.exitCode ?? 1);
