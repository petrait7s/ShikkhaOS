import * as React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import type { Homework } from "@shikkhaos/types";
import { useApp, useAction, useGet } from "../../lib/app";
import { Badge, Btn, Card, ErrorView, Field, Loading, Screen, T, fmtDateTime } from "../../components/ui";

export default function HomeworkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { api } = useApp(); const router = useRouter();
  const q = useGet<Homework & { mySubmission: { text: string | null; grade: string | null; feedback: string | null } | null }>(`/homework/${id}`);
  const [text, setText] = React.useState(""); const [files, setFiles] = React.useState<string[]>([]); const [uploading, setUploading] = React.useState(false); const [err, setErr] = React.useState<string>();
  React.useEffect(() => { if (q.data?.mySubmission?.text) setText(q.data.mySubmission.text); }, [q.data]);
  const submit = useAction(async () => { setErr(undefined); try { await api.post(`/homework/${id}/submissions`, { text, fileIds: files }); router.back(); } catch (e) { setErr((e as Error).message); } }, { invalidate: ["/homework"] });
  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false }); if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0]; setUploading(true); setErr(undefined);
    try { const blob = await (await fetch(a.uri)).blob(); const up = await api.upload({ name: a.name, type: a.mimeType ?? "application/octet-stream", size: a.size ?? blob.size, data: blob }, "HOMEWORK"); setFiles((f) => [...f, up.id]); } catch (e) { setErr((e as Error).message); } finally { setUploading(false); }
  };
  if (q.isLoading) return <Screen><Loading /></Screen>; if (q.error) return <Screen><ErrorView error={q.error} onRetry={() => void q.refetch()} /></Screen>;
  const h = q.data!; const graded = !!h.mySubmission?.grade;
  return <Screen>
    <T size={20} weight="700">{h.title}</T><T color="text2">Due {fmtDateTime(h.dueAt)}</T><T>{h.description}</T>
    {graded ? <Card><Badge text={`Graded ${h.mySubmission!.grade}`} tone="ok" /><T>{h.mySubmission!.feedback}</T></Card> : <>
      {err ? <T color="bad">{err}</T> : null}
      <Field label="Your answer" value={text} onChangeText={setText} multiline numberOfLines={5} style={{ minHeight: 120, textAlignVertical: "top" }} />
      <Btn title={uploading ? "Uploading…" : files.length ? `Add another file (${files.length} attached)` : "Attach a file or photo"} variant="plain" onPress={() => void pick()} disabled={uploading} />
      <Btn title={h.mySubmission ? "Resubmit" : "Submit"} onPress={() => submit.mutate(undefined)} busy={submit.isPending} disabled={!text.trim() && files.length === 0} /></>}
  </Screen>;
}
