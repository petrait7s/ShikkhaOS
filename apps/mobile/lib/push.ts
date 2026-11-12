import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { ApiClient } from "@shikkhaos/api-client";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: true }) });

/** Ask for permission and register this device's native (FCM) token with the API. Safe no-op when unavailable. */
export async function registerPush(api: ApiClient, deviceId: string): Promise<"registered" | "denied" | "unavailable"> {
  try {
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "School updates", importance: Notifications.AndroidImportance.DEFAULT });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return "denied";
    const token = await Notifications.getDevicePushTokenAsync();
    await api.post("/devices/push-token", { deviceId, pushToken: String(token.data) });
    return "registered";
  } catch { return "unavailable"; }
}

/** shikkhaos://results/<id> style deep links -> app routes (same mapping as the web/desktop apps). */
export function routeFor(deepLink?: string): string {
  const [head, id] = (deepLink ?? "").replace("shikkhaos://", "").split("/");
  switch (head) {
    case "results": return "/(tabs)/results"; case "attendance": return "/(tabs)/attendance"; case "messages": return id ? `/messages/${id}` : "/(tabs)/messages";
    case "notices": return "/notices"; case "homework": return id ? `/homework/${id}` : "/homework"; case "class-tests": return "/class-tests"; default: return "/notifications";
  }
}
