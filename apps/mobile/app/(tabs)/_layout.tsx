import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useTheme } from "../../lib/theme";
import { useList, useRealtimeInvalidate } from "../../lib/app";
import type { Conversation } from "@shikkhaos/types";

const icon = (g: string) => ({ color }: { color: string }) => <Text style={{ fontSize: 20, color }}>{g}</Text>;

export default function TabsLayout() {
  const t = useTheme(); const convs = useList<Conversation>("/conversations");
  useRealtimeInvalidate(["message.created", "conversation.read"], ["/conversations"]);
  const unread = (convs.data ?? []).reduce((a, c) => a + (c.unread ?? 0), 0);
  return <Tabs screenOptions={{ tabBarActiveTintColor: t.accent, tabBarStyle: { backgroundColor: t.surface, minHeight: 56 }, headerStyle: { backgroundColor: t.surface }, headerTintColor: t.text }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("⌂") }} />
    <Tabs.Screen name="results" options={{ title: "Results", tabBarIcon: icon("★") }} />
    <Tabs.Screen name="attendance" options={{ title: "Attendance", tabBarIcon: icon("✓") }} />
    <Tabs.Screen name="messages" options={{ title: "Messages", tabBarIcon: icon("✉"), tabBarBadge: unread || undefined }} />
    <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: icon("≡") }} />
  </Tabs>;
}
