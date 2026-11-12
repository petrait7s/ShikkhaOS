import * as React from "react";
import { FlatList, KeyboardAvoidingView, Platform, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { Conversation, Message } from "@shikkhaos/types";
import { newId } from "@shikkhaos/api-client";
import { useApp, useAction, useList } from "../../lib/app";
import { Btn, Empty, ErrorView, Field, Loading, T, fmtDateTime } from "../../components/ui";
import { useTheme } from "../../lib/theme";
import { canPost as canPostIn } from "../../lib/format";

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { api, rt, auth } = useApp(); const t = useTheme();
  const convs = useList<Conversation>("/conversations"); const conv = convs.data?.find((c) => c.id === id);
  const msgs = useList<Message>(`/conversations/${id}/messages`, undefined, 100); const [body, setBody] = React.useState(""); const [err, setErr] = React.useState<string>();
  React.useEffect(() => { void api.post(`/conversations/${id}/read`).catch(() => {}); }, [api, id, msgs.data?.length]);
  React.useEffect(() => { const off = [rt.on("message.created", (p) => { if (p.conversationId === id) void msgs.refetch(); }), rt.on("ws.open", () => void msgs.refetch())]; return () => off.forEach((f) => f()); }, [rt, id]);
  const canPost = !!conv && canPostIn(conv);
  const send = useAction(async () => { const text = body.trim(); if (!text) return; const cid = newId(); setBody(""); try { await api.post(`/conversations/${id}/messages`, { body: text, clientMessageId: cid }, { idempotencyKey: cid }); void msgs.refetch(); } catch (e) { setBody(text); setErr((e as Error).message); } }, { invalidate: ["/conversations"] });
  if (msgs.isLoading || convs.isLoading) return <Loading />; if (msgs.error) return <ErrorView error={msgs.error} onRetry={() => void msgs.refetch()} />;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <FlatList inverted data={msgs.data} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 12, gap: 8 }} ListEmptyComponent={<Empty title="No messages yet" />}
        renderItem={({ item: m }) => { const mine = m.senderId === auth?.user.id; return <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", backgroundColor: mine ? t.accent : t.neutral, borderRadius: 16, padding: 10 }}>{!mine ? <T size={11} color="text2">{m.senderName}</T> : null}<T style={{ color: mine ? "#fff" : t.text }}>{m.body}</T><T size={10} style={{ color: mine ? "#dbe8ff" : t.text3 }}>{fmtDateTime(m.createdAt)}</T></View>; }} />
      {err ? <T color="bad" style={{ paddingHorizontal: 12 }}>{err}</T> : null}
      {canPost ? <View style={{ flexDirection: "row", gap: 8, padding: 10, alignItems: "flex-end" }}><View style={{ flex: 1 }}><Field label="Message" value={body} onChangeText={setBody} maxLength={4000} multiline /></View><Btn title="Send" onPress={() => send.mutate(undefined)} disabled={!body.trim()} /></View>
        : <View style={{ padding: 14 }}><T color="text3">You can read this conversation but not post in it.</T></View>}
    </KeyboardAvoidingView>
  );
}
