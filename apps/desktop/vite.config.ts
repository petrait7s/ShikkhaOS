import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Renderer bundle for the Electron app. API base URL and mode are fixed at build time (CI sets them for releases).
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  base: "./",
  plugins: [react()],
  build: { outDir: resolve(__dirname, "dist/renderer"), emptyOutDir: true, sourcemap: false, target: "chrome130" },
  define: {
    __API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL || process.env.SHIKKHAOS_API_BASE_URL || "http://localhost:8080/api/v1"),
    __API_MODE__: JSON.stringify(process.env.VITE_API_MODE || "live"),
  },
  server: { port: 5173, strictPort: true },
});
