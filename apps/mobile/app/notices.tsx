import type { Notice } from "@shikkhaos/types";
import { useList, useRealtimeInvalidate } from "../lib/app";
import { Card, Empty, ErrorView, Loading, Screen, T, fmtDate } from "../components/ui";

export default function Notices() {
  const q = useList<Notice>("/notices", { status: "PUBLISHED" }); useRealtimeInvalidate(["notice.published"], ["/notices"]);
  if (q.isLoading) return <Screen><Loading /></Screen>; if (q.error) return <Screen><ErrorView error={q.error} onRetry={() => void q.refetch()} /></Screen>;
  return <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>{q.data!.length === 0 ? <Empty title="No notices" /> : q.data!.map((n) => <Card key={n.id}><T size={16} weight="700">{n.pinned ? "📌 " : ""}{n.title}</T><T>{n.body}</T><T size={12} color="text3">{n.createdByName} · {fmtDate(n.publishedAt)}</T></Card>)}</Screen>;
}
