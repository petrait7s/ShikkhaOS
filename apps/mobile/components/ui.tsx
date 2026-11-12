import * as React from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@shikkhaos/api-client";
import { space, useTheme } from "../lib/theme";

export function Screen({ children, scroll = true, onRefresh, refreshing }: { children: React.ReactNode; scroll?: boolean; onRefresh?: () => void; refreshing?: boolean }) {
  const t = useTheme();
  const body = scroll ? <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}>{children}</ScrollView> : <View style={{ flex: 1 }}>{children}</View>;
  return <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: t.bg }}>{body}</SafeAreaView>;
}
export function T({ children, size = 15, weight = "400", color, style }: { children: React.ReactNode; size?: number; weight?: "400" | "500" | "600" | "700"; color?: "text2" | "text3" | "bad" | "ok" | "accent"; style?: object }) {
  const t = useTheme(); return <Text style={[{ fontSize: size, fontWeight: weight, color: color ? t[color] : t.text }, style]}>{children}</Text>;
}
export function Card({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: ViewStyle }) {
  const t = useTheme(); const s = [{ backgroundColor: t.surface, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, padding: space.lg, gap: space.xs }, style];
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...s, pressed && { opacity: 0.7 }]}>{children}</Pressable> : <View style={s}>{children}</View>;
}
export function Btn({ title, onPress, variant = "primary", busy, disabled }: { title: string; onPress: () => void; variant?: "primary" | "plain" | "danger"; busy?: boolean; disabled?: boolean }) {
  const t = useTheme(); const bg = variant === "primary" ? t.accent : variant === "danger" ? t.bad : t.surface; const fg = variant === "plain" ? t.text : "#fff";
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => ({ minHeight: 48, borderRadius: 10, backgroundColor: bg, borderWidth: variant === "plain" ? 1 : 0, borderColor: t.border, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}>{busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 16, fontWeight: "600" }}>{title}</Text>}</Pressable>;
}
export function Field({ label, error, ...p }: TextInputProps & { label: string; error?: string }) {
  const t = useTheme();
  return <View style={{ gap: 4 }}><T size={13} weight="500" color="text2">{label}</T><TextInput accessibilityLabel={label} placeholderTextColor={t.text3} {...p} style={{ minHeight: 48, borderWidth: 1, borderColor: error ? t.bad : t.border, borderRadius: 10, paddingHorizontal: space.md, color: t.text, backgroundColor: t.surface, fontSize: 16 }} />{error ? <T size={12} color="bad">{error}</T> : null}</View>;
}
export function Badge({ text, tone }: { text: string; tone?: "ok" | "warn" | "bad" | "info" }) {
  const t = useTheme(); const bg = tone === "ok" ? t.okBg : tone === "warn" ? t.warnBg : tone === "bad" ? t.badBg : tone === "info" ? t.infoBg : t.neutral; const fg = tone === "ok" ? t.ok : tone === "warn" ? t.warn : tone === "bad" ? t.bad : tone === "info" ? t.info : t.text2;
  return <View style={{ alignSelf: "flex-start", backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}><Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{text}</Text></View>;
}
export function Loading() { const t = useTheme(); return <View style={{ padding: space.xl, alignItems: "center" }} accessibilityLabel="Loading"><ActivityIndicator color={t.accent} /></View>; }
export function Empty({ title, hint }: { title: string; hint?: string }) { return <View style={{ padding: space.xl, alignItems: "center", gap: 4 }}><T size={16} weight="600">{title}</T>{hint ? <T color="text2" style={{ textAlign: "center" }}>{hint}</T> : null}</View>; }
export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as ApiError; const offline = e instanceof ApiError && e.code === "NETWORK";
  return <View style={{ padding: space.xl, alignItems: "center", gap: space.sm }} accessibilityRole="alert"><T size={16} weight="600">{offline ? "You're offline" : "Something went wrong"}</T><T color="text2" style={{ textAlign: "center" }}>{e?.message}</T>{e instanceof ApiError && e.requestId ? <T size={11} color="text3">Request {e.requestId}</T> : null}{onRetry ? <Btn title="Try again" variant="plain" onPress={onRetry} /> : null}</View>;
}
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
export const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
