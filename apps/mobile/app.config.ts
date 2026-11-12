import type { ExpoConfig } from "expo/config";

// Version is stamped by CI (APP_VERSION); API settings are fixed at build time (EXPO_PUBLIC_*).
const config: ExpoConfig = {
  name: "ShikkhaOS",
  slug: "shikkhaos-student",
  version: process.env.APP_VERSION?.replace(/[-+].*$/, "") || "0.1.0",
  orientation: "portrait",
  scheme: "shikkhaos",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  android: {
    package: "app.shikkhaos.student",
    adaptiveIcon: { foregroundImage: "./assets/icon.png", backgroundColor: "#0a64ff" },
    permissions: ["POST_NOTIFICATIONS"],
    allowBackup: false,
    // google-services.json is injected by CI from a secret when push is enabled; never committed.
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
  },
  plugins: ["expo-router", "expo-secure-store", ["expo-notifications", { color: "#0a64ff" }], "expo-local-authentication"],
  experiments: { typedRoutes: false },
  extra: { apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || process.env.SHIKKHAOS_API_BASE_URL || "http://10.0.2.2:8080/api/v1", apiMode: process.env.EXPO_PUBLIC_API_MODE || "live" },
};
export default config;
