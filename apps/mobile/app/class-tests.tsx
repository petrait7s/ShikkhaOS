import type { Student } from "@shikkhaos/types";
import { useGet } from "../lib/app";
import { Badge, Card, Empty, ErrorView, Loading, Screen, T, fmtDate } from "../components/ui";

export default function ClassTests() {
  const me = useGet<Student>("/students/me"); const id = me.data?.id ?? null;
  const q = useGet<{ id: string; title: string; testDate: string; fullMarks: number; marks: number | null; absent: boolean; subjectName: string | null }[]>(id ? `/students/${id}/class-tests` : null);
  if (me.isLoading || q.isLoading) return <Screen><Loading /></Screen>; if (me.error || q.error) return <Screen><ErrorView error={me.error ?? q.error} onRetry={() => void q.refetch()} /></Screen>;
  return <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}><Badge text="Class tests — not official results" tone="info" />
    {q.data!.length === 0 ? <Empty title="No class tests shared yet" /> : q.data!.map((r) => <Card key={r.id}><T weight="700">{r.title}</T><T color="text2" size={13}>{r.subjectName ?? ""} · {fmtDate(r.testDate)}</T><T size={20} weight="700">{r.absent ? "Absent" : `${r.marks} / ${r.fullMarks}`}</T></Card>)}</Screen>;
}
