import { build } from "esbuild";
const common = { platform: "node", target: "node20", bundle: true, sourcemap: false, minify: false, external: ["electron", "electron-updater"], format: "cjs" };
await build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist/main/main.js" });
await build({ ...common, entryPoints: ["src/main/preload.ts"], outfile: "dist/main/preload.js" });
console.log("main + preload built");
