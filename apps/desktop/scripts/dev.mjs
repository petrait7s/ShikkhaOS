import { spawn } from "node:child_process";
import { build } from "esbuild";
const vite = spawn("pnpm", ["exec", "vite"], { stdio: "inherit" });
await new Promise((r) => setTimeout(r, 2500));
await import("./build-main.mjs");
const electron = spawn("pnpm", ["exec", "electron", "."], { stdio: "inherit", env: { ...process.env, SHIKKHAOS_DEV_URL: "http://localhost:5173" } });
electron.on("exit", () => { vite.kill(); process.exit(0); });
void build;
