import { useRouter } from "expo-router";
import type { Homework } from "@shikkhaos/types";
import { useList, useRealtimeInvalidate } from "../../lib/app";
import { Badge, Card, Empty, ErrorView, Loading, Screen, T, fmtDateTime } from "../../components/ui";

export default function HomeworkList() {
  const router = useRouter(); const q = useList<Homework>("/homework"); useRealtimeInvalidate(["homework.assigned", "homework.graded"], ["/homework"]);
  if (q.isLoading) return <Screen><Loading /></Screen>; if (q.error) return <Screen><ErrorView error={q.error} onRetry={() => void q.refetch()} /></Screen>;
  return <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>{q.data!.length === 0 ? <Empty title="No homework" hint="You're all caught up." /> : q.data!.map((h) => {
    const s = h.mySubmission; const overdue = new Date(h.dueAt) < new Date();
    return <Card key={h.id} onPress={() => router.push(`/homework/${h.id}`)}><T size={16} weight="700">{h.title}</T><T color="text2" size={13}>{h.subjectName ?? ""} · due {fmtDateTime(h.dueAt)}</T>{s ? (s.grade ? <Badge text={`Graded ${s.grade}`} tone="ok" /> : <Badge text="Submitted" tone="info" />) : overdue ? <Badge text="Overdue" tone="bad" /> : <Badge text="To do" tone="warn" />}</Card>; })}</Screen>;
}
