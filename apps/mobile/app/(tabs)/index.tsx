import { useRouter } from "expo-router";
import type { Homework, Notice, PublishedResult, Student } from "@shikkhaos/types";
import { useApp, useGet, useList } from "../../lib/app";
import { Badge, Card, Empty, ErrorView, Loading, Screen, T, fmtDate, fmtDateTime } from "../../components/ui";

export default function Home() {
  const { auth } = useApp(); const router = useRouter();
  const me = useGet<Student>("/students/me");
  const id = me.data?.id ?? null;
  const results = useGet<PublishedResult[]>(id ? `/students/${id}/results` : null);
  const att = useGet<{ summary: { percentage: number; absent: number; total: number } }>(id ? `/students/${id}/attendance` : null);
  const hw = useList<Homework>("/homework"); const notices = useList<Notice>("/notices", { limit: 3 }, 3);
  const refresh = () => { void me.refetch(); void results.refetch(); void att.refetch(); void hw.refetch(); void notices.refetch(); };
  if (me.isLoading) return <Screen><Loading /></Screen>; if (me.error) return <Screen><ErrorView error={me.error} onRetry={refresh} /></Screen>;
  const todo = (hw.data ?? []).filter((h) => h.status === "PUBLISHED" && !h.mySubmission);
  const last = results.data?.[0];
  return (
    <Screen onRefresh={refresh} refreshing={me.isRefetching}>
      <T size={24} weight="700">Hello, {auth?.user.displayName.split(" ")[0]}</T>
      <T color="text2">{me.data?.className ? `${me.data.className}-${me.data.sectionName} · Roll ${me.data.currentRollNo}` : "Not enrolled"}</T>
      <Card onPress={() => router.push("/(tabs)/attendance")}><T color="text2" size={13}>Attendance</T><T size={28} weight="700">{att.data ? `${att.data.summary.percentage}%` : "—"}</T>{att.data ? <T color="text3" size={13}>{att.data.summary.absent} absent of {att.data.summary.total} days</T> : null}</Card>
      <Card onPress={() => router.push("/(tabs)/results")}><T color="text2" size={13}>Latest result</T>{last ? <><T size={17} weight="600">{last.examName}</T><T>GPA {Number(last.gpa).toFixed(2)} · Grade {last.grade} {last.revision > 1 ? "· revised" : ""}</T></> : <T color="text2">No published results yet</T>}</Card>
      <Card onPress={() => router.push("/homework")}><T color="text2" size={13}>Homework</T><T size={17} weight="600">{todo.length} to do</T>{todo[0] ? <T color="text2">Next: {todo[0].title} — due {fmtDateTime(todo[0].dueAt)}</T> : null}</Card>
      <T size={17} weight="600">Notices</T>
      {notices.data?.length ? notices.data.map((n) => <Card key={n.id} onPress={() => router.push("/notices")}><T weight="600">{n.title}</T><T color="text3" size={12}>{fmtDate(n.publishedAt)}</T></Card>) : <Empty title="No notices" />}
    </Screen>
  );
}
void Badge;
