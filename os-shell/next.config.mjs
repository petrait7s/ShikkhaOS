/** Static export: the whole app runs in the browser (mock backend), so it can be served from any
 *  static host, zipped, or wrapped in Electron for the desktop build. */
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};
export default nextConfig;
