import * as React from "react";
import { AppState } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as LocalAuth from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { AppProvider, useApp } from "../lib/app";
import { registerPush, routeFor } from "../lib/push";
import { Loading } from "../components/ui";

function Gate() {
  const { auth, booting, api } = useApp(); const segments = useSegments(); const router = useRouter();
  React.useEffect(() => { if (booting) return; const inAuth = segments[0] === "login"; if (!auth && !inAuth) router.replace("/login"); else if (auth && inAuth) router.replace("/(tabs)"); }, [auth, booting, segments]);
  React.useEffect(() => { if (auth) void registerPush(api, api.opts.deviceId); }, [auth, api]);
  React.useEffect(() => { const sub = Notifications.addNotificationResponseReceivedListener((r) => { const link = (r.notification.request.content.data as { deepLink?: string })?.deepLink; router.push(routeFor(link) as never); }); return () => sub.remove(); }, [router]);
  // Optional biometric re-lock when returning from background after 5 minutes (setting in Profile).
  React.useEffect(() => {
    let left = 0;
    const sub = AppState.addEventListener("change", async (s) => {
      if (s === "background") left = Date.now();
      else if (s === "active" && left && Date.now() - left > 5 * 60_000 && auth) {
        const on = await SecureStore.getItemAsync("sos.biometric").catch(() => null);
        if (on === "1" && (await LocalAuth.hasHardwareAsync())) { const r = await LocalAuth.authenticateAsync({ promptMessage: "Unlock ShikkhaOS" }); if (!r.success) await api.logout(); }
      }
    });
    return () => sub.remove();
  }, [auth, api]);
  if (booting) return <Loading />;
  return <Stack screenOptions={{ headerBackTitle: "Back" }}>
    <Stack.Screen name="login" options={{ headerShown: false }} />
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="messages/[id]" options={{ title: "Conversation" }} />
    <Stack.Screen name="homework/index" options={{ title: "Homework" }} /><Stack.Screen name="homework/[id]" options={{ title: "Homework" }} />
    <Stack.Screen name="notices" options={{ title: "Notices" }} /><Stack.Screen name="notifications" options={{ title: "Notifications" }} />
    <Stack.Screen name="class-tests" options={{ title: "Class tests" }} /><Stack.Screen name="profile" options={{ title: "Profile & security" }} />
  </Stack>;
}

export default function Root() { return <AppProvider><StatusBar style="auto" /><Gate /></AppProvider>; }
