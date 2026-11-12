import { View } from "react-native";
import type { AttendanceSummary, Student } from "@shikkhaos/types";
import { useGet } from "../../lib/app";
import { Badge, Card, Empty, ErrorView, Loading, Screen, T, fmtDate } from "../../components/ui";

export default function Attendance() {
  const me = useGet<Student>("/students/me"); const id = me.data?.id ?? null;
  const q = useGet<{ summary: AttendanceSummary; records: { date: string; status: string }[] }>(id ? `/students/${id}/attendance` : null);
  if (me.isLoading || q.isLoading) return <Screen><Loading /></Screen>; if (me.error || q.error) return <Screen><ErrorView error={me.error ?? q.error} onRetry={() => void q.refetch()} /></Screen>;
  const { summary: a, records } = q.data!;
  const tone = (s: string) => (s === "PRESENT" ? "ok" : s === "ABSENT" ? "bad" : s === "LATE" ? "warn" : "info") as "ok" | "bad" | "warn" | "info";
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Card><T color="text2" size={13}>Attendance</T><T size={34} weight="700">{a.percentage}%</T><T color="text2">Present {a.present} · Absent {a.absent} · Late {a.late} · Excused {a.excused}</T></Card>
      {records.length === 0 ? <Empty title="No attendance recorded yet" /> : records.map((r) => <Card key={r.date + r.status}><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><T>{fmtDate(r.date)}</T><Badge text={r.status.toLowerCase()} tone={tone(r.status)} /></View></Card>)}
    </Screen>
  );
}
