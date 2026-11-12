import * as React from "react";
import { Linking, View } from "react-native";
import type { PublishedResult, Student } from "@shikkhaos/types";
import { useApp, useGet } from "../../lib/app";
import { Badge, Btn, Card, Empty, ErrorView, Loading, Screen, T } from "../../components/ui";

export default function Results() {
  const { api } = useApp(); const me = useGet<Student>("/students/me"); const id = me.data?.id ?? null;
  const q = useGet<PublishedResult[]>(id ? `/students/${id}/results` : null); const cards = useGet<{ examName: string; fileId: string }[]>(id ? `/students/${id}/report-cards` : null);
  const [err, setErr] = React.useState<string>();
  if (me.isLoading || q.isLoading) return <Screen><Loading /></Screen>; if (me.error || q.error) return <Screen><ErrorView error={me.error ?? q.error} onRetry={() => { void me.refetch(); void q.refetch(); }} /></Screen>;
  const dl = async (fileId: string) => { try { await Linking.openURL(await api.downloadUrl(fileId)); } catch { setErr("Could not open the report card."); } };
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {err ? <T color="bad">{err}</T> : null}
      {q.data!.length === 0 ? <Empty title="No results yet" hint="You'll get a notification when a result is published." /> : q.data!.map((r) => (
        <Card key={r.resultSetId}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><T size={17} weight="700">{r.examName}</T>{r.revision > 1 ? <Badge text={`Revised r${r.revision}`} tone="warn" /> : null}</View>
          <T>GPA <T weight="700">{Number(r.gpa).toFixed(2)}</T> · Grade <T weight="700">{r.grade}</T> · Total {r.totalMarks}{r.position ? ` · Position ${r.position}` : ""}</T>
          <Badge text={r.passed ? "Passed" : "Not passed"} tone={r.passed ? "ok" : "bad"} />
          <View style={{ marginTop: 8, gap: 6 }}>{r.subjects.map((s) => <View key={s.subjectId} style={{ flexDirection: "row", justifyContent: "space-between" }}><T style={{ flex: 1 }}>{s.subjectName}</T><T weight="600">{s.absent ? "Absent" : `${s.marks}/${s.fullMarks}`}  {s.grade}</T></View>)}</View>
          {cards.data?.find((c) => c.examName === r.examName) ? <View style={{ marginTop: 8 }}><Btn title="Download report card" variant="plain" onPress={() => void dl(cards.data!.find((c) => c.examName === r.examName)!.fileId)} /></View> : null}
        </Card>))}
    </Screen>
  );
}
