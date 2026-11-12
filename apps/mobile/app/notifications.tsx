import { useRouter } from "expo-router";
import type { NotificationItem } from "@shikkhaos/types";
import { useApp, useAction, useList, useRealtimeInvalidate } from "../lib/app";
import { routeFor } from "../lib/push";
import { Badge, Btn, Card, Empty, ErrorView, Loading, Screen, T, fmtDateTime } from "../components/ui";

export default function Notifications() {
  const { api } = useApp(); const router = useRouter(); const q = useList<NotificationItem>("/notifications", undefined, 100); useRealtimeInvalidate(["notification.created"], ["/notifications"]);
  const readAll = useAction(() => api.post("/notifications/read-all"), { invalidate: ["/notifications"] });
  if (q.isLoading) return <Screen><Loading /></Screen>; if (q.error) return <Screen><ErrorView error={q.error} onRetry={() => void q.refetch()} /></Screen>;
  const open = async (n: NotificationItem) => { if (!n.readAt) await api.post(`/notifications/${n.id}/read`).catch(() => {}); router.push(routeFor(n.data?.deepLink) as never); void q.refetch(); };
  return <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}><Btn title="Mark all read" variant="plain" onPress={() => readAll.mutate(undefined)} />
    {q.data!.length === 0 ? <Empty title="You're all caught up" /> : q.data!.map((n) => <Card key={n.id} onPress={() => void open(n)}><T weight={n.readAt ? "400" : "700"}>{n.title}</T><T color="text2" size={13}>{n.body}</T>{!n.readAt ? <Badge text="new" tone="info" /> : null}<T size={11} color="text3">{fmtDateTime(n.createdAt)}</T></Card>)}</Screen>;
}
