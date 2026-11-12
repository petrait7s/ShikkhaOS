// Web build of ShikkhaOS. API_MODE=live: the browser talks to the Rust API (same-origin proxy in dev, absolute URL in prod).
const api = process.env.API_PROXY_TARGET || "";
const apiOrigin = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/api\/v1\/?$/, "");
const csp = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${apiOrigin.replace(/^http/, "ws")} ws://localhost:* http://localhost:*`.trim(),
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@shikkhaos/screens", "@shikkhaos/api-client", "@shikkhaos/types", "@shikkhaos/permissions", "@shikkhaos/validation"],
  async rewrites() { return api ? [{ source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` }] : []; },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: csp }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};
