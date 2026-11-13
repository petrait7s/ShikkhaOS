"use client";
import { Check, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { Student } from "@/api/contracts";
import { repos } from "@/api/factory";
import { RESULT_KEYS, keys, useExamsQ, useMatrixQ, useMut, useSignupsQ } from "@/api/hooks";
import { Avatar, Btn, Empty, ErrorBox, Field, Modal, SkeletonRows } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { pickExam } from "@/os/Widgets";

export default function Approvals() {
  const { t, lang } = useT();
  const [tab, setTab] = useState<"signups" | "marks">("signups");
  const signups = useSignupsQ();
  const exams = useExamsQ();
  const exam = pickExam(exams.data);
  const matrix = useMatrixQ(exam?.id ?? "");
  const [rej, setRej] = useState<Student | null>(null);
  const [reason, setReason] = useState("");
  const approve = useMut((id: string) => repos.approval.approve(id), [keys.signups, keys.students], t("ap.approved"));
  const reject = useMut((v: { id: string; reason: string }) => repos.approval.reject(v.id, v.reason), [keys.signups, keys.students], t("ap.rejected"));
  const verify = useMut((v: { classNo: number; section: string; subject: string }) => repos.marks.verify({ examId: exam?.id ?? "", ...v }), [...RESULT_KEYS], t("rc.verified"));
  const waiting = (matrix.data?.cells ?? []).filter((c) => c.state === "submitted" || c.state === "uploaded");

  return (
    <div className="flex h-full min-h-[380px] flex-col">
      <div className="border-b p-3" style={{ borderColor: "var(--line)" }}>
        <div className="inline-flex rounded-lg p-0.5" style={{ background: "var(--paper-2)" }} role="tablist">
          {(["signups", "marks"] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cn("h-7 rounded-md px-3 text-[12px] font-semibold")} style={{ background: tab === k ? "var(--card)" : "transparent" }}>{t(`ap.tab.${k}`)}{k === "signups" && signups.data?.length ? ` (${signups.data.length})` : k === "marks" && waiting.length ? ` (${waiting.length})` : ""}</button>)}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3">
        {tab === "signups" ? (
          signups.isLoading ? <SkeletonRows /> : signups.isError ? <ErrorBox error={signups.error} /> : (signups.data ?? []).length === 0 ? <Empty title={t("ap.none")} hint={t("ap.none.hint")} icon={<ShieldCheck size={22} />} /> : (
            <ul className="grid gap-2">{(signups.data ?? []).map((s) => (
              <li key={s.id} className="card flex flex-wrap items-center gap-3 p-3">
                <Avatar name={s.name} size={36} photo={s.photo} />
                <div className="min-w-0 flex-1"><div className="font-bold">{lang === "bn" ? s.nameBn : s.name}</div><div className="muted text-[12px]">{s.studentId} · {t("rc.class", { c: s.classNo, s: s.section })} · {t("col.roll")} {s.roll}</div><div className="faint text-[12px]">{t("ap.roster.match")}</div></div>
                <Btn variant="primary" size="sm" disabled={approve.isPending} onClick={() => approve.mutate(s.id)}><Check size={13} />{t("ap.approve")}</Btn>
                <Btn size="sm" onClick={() => { setRej(s); setReason(""); }}><X size={13} />{t("ap.reject")}</Btn>
              </li>))}</ul>
          )
        ) : matrix.isLoading ? <SkeletonRows /> : waiting.length === 0 ? <Empty title={t("ap.marks.none")} icon={<ShieldCheck size={22} />} /> : (
          <ul className="grid gap-2">{waiting.map((c) => (
            <li key={`${c.classNo}${c.section}${c.subject}`} className="card flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1"><div className="font-bold">{t("rc.class", { c: c.classNo, s: c.section })} · {c.subject}</div><div className="muted text-[12px]">{t(`state.${c.state}`)} · {Object.keys(c.marks).length} {t("wiz.rows")}</div></div>
              <Btn variant="primary" size="sm" disabled={verify.isPending} onClick={() => verify.mutate({ classNo: c.classNo, section: c.section, subject: c.subject })}><ShieldCheck size={13} />{t("rc.verify")}</Btn>
            </li>))}</ul>
        )}
      </div>
      <Modal open={!!rej} onClose={() => setRej(null)} title={t("ap.reject")} footer={<><Btn onClick={() => setRej(null)}>{t("cancel")}</Btn><Btn variant="danger" disabled={reason.trim().length < 3 || reject.isPending} onClick={() => rej && void reject.mutateAsync({ id: rej.id, reason }).then(() => setRej(null)).catch(() => undefined)}>{t("ap.reject")}</Btn></>}>
        <Field label={t("rc.reason")}><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
