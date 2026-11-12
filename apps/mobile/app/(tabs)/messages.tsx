import { View } from "react-native";
import { useRouter } from "expo-router";
import type { Conversation } from "@shikkhaos/types";
import { useList, useRealtimeInvalidate } from "../../lib/app";
import { Badge, Card, Empty, ErrorView, Loading, Screen, T } from "../../components/ui";

export const convTitle = (c: Conversation) => (c.type === "DIRECT" ? c.peer?.displayName ?? "Message" : c.title ?? "Channel");

export default function Messages() {
  const router = useRouter(); const q = useList<Conversation>("/conversations");
  useRealtimeInvalidate(["message.created", "conversation.created", "conversation.read"], ["/conversations"]);
  if (q.isLoading) return <Screen><Loading /></Screen>; if (q.error) return <Screen><ErrorView error={q.error} onRetry={() => void q.refetch()} /></Screen>;
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.data!.length === 0 ? <Empty title="No conversations" hint="Your class group appears here once you are enrolled." /> : q.data!.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/messages/${c.id}`)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T weight="600">{convTitle(c)}</T>{c.unread ? <Badge text={String(c.unread)} tone="info" /> : null}</View>
          <T color="text2" size={13}>{c.type === "CLASS_GROUP" ? "Class group · " : c.type === "CHANNEL" ? "Channel · " : ""}{c.lastMessage?.preview ?? "No messages yet"}</T>
        </Card>))}
    </Screen>
  );
}
