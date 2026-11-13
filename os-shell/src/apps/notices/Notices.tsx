"use client";
import { isAdmin } from "@/lib/roles";
import { Eye, Megaphone, Pin, PinOff, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Notice } from "@/api/contracts";
import { repos } from "@/api/factory";
import { keys, useMut, useNoticesQ } from "@/api/hooks";
import { Badge, Btn, Empty, ErrorBox, Field, Modal, SkeletonRows } from "@/components/ui";
import { fmtDateTime, fromLocalInput, toLocalInput } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { useIntent } from "@/store/intent";
import { useUI } from "@/store/ui";

export default function Notices() {
  const { t, lang, n } = useT();
  const role = useUI((s) => s.session?.role);
  const q = useNoticesQ();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Notice | null>(null);
  const pin = useMut((id: string) => repos.notice.togglePin(id), [keys.notices]);
  const qc = useQueryClient();
  const intent = useIntent((s) => s.intent);
  const clearIntent = useIntent((s) => s.clear);
  const userId = useUI((s) => s.session?.userId);
  const openNotice = (x: Notice) => {
    setSel(x);
    if (!isAdmin(role)) void repos.notice.markRead(x.id).then(() => qc.invalidateQueries({ queryKey: keys.notices }));
  };
  useEffect(() => {
    if (intent?.kind !== "notice" || !q.data) return;
    const x = q.data.find((nn) => nn.id === intent.id);
    clearIntent();
    if (x) openNotice(x);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, q.data]);
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  const reg = isAdmin(role);
  const list = q.data ?? [];
  return (
    <div className="flex h-full min-h-[380px] flex-col">
      {reg ? <div className="flex justify-end border-b p-3" style={{ borderColor: "var(--line)" }}><Btn variant="primary" onClick={() => setOpen(true)}><Plus size={14} />{t("nt.compose")}</Btn></div> : null}
      {list.length === 0 ? <Empty title={t("nt.empty")} icon={<Megaphone size={22} />} /> : (
        <ul className="scroll-thin grid flex-1 content-start gap-2 overflow-auto p-3">
          {list.map((x) => {
            const future = new Date(x.publishAt).getTime() > Date.now();
            return (
              <li key={x.id} className="card p-3">
                <div className="flex items-start gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openNotice(x)}>
                    <div className="flex flex-wrap items-center gap-1.5">{!reg && userId && !(x.readBy ?? []).includes(userId) ? <span className="prio prio-medium" aria-label={t("ac.unread")} /> : null}<span className="font-bold">{x.pinned ? <Pin size={12} className="mr-1 inline -translate-y-px" /> : null}{x.title}</span><Badge>{x.audience === "all" ? t("nt.aud.all") : x.audience === "teachers" ? t("nt.aud.teachers") : t("nt.aud.class", { c: x.classNo ?? "" })}</Badge>{future ? <Badge tone="warn">{t("nt.scheduled")}</Badge> : null}</div>
                    <div className="muted mt-1 line-clamp-2 text-[13px]">{x.body}</div>
                    <div className="faint mt-1 flex items-center gap-3 text-[11px]"><span>{fmtDateTime(x.publishAt, lang)}</span>{reg ? <span className="flex items-center gap-1"><Eye size={11} />{n(x.reads)}</span> : null}</div>
                  </button>
                  {reg ? <Btn variant="icon" size="sm" aria-label={x.pinned ? t("nt.unpin") : t("nt.pin")} onClick={() => pin.mutate(x.id)}>{x.pinned ? <PinOff size={14} /> : <Pin size={14} />}</Btn> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.title ?? ""} footer={<Btn onClick={() => setSel(null)}>{t("close")}</Btn>}>{sel ? <><p className="whitespace-pre-wrap text-[14px]">{sel.body}</p><div className="faint mt-3 text-[12px]">{fmtDateTime(sel.publishAt, lang)} · {sel.author}</div></> : null}</Modal>
      {open ? <Compose onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function Compose({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({ title: "", body: "", audience: "all" as Notice["audience"], classNo: 6, pinned: false, at: toLocalInput(new Date().toISOString()) });
  const [err, setErr] = useState<Record<string, string>>({});
  const m = useMut(() => repos.notice.create({ title: f.title.trim(), body: f.body.trim(), audience: f.audience, classNo: f.audience === "class" ? f.classNo : null, pinned: f.pinned, publishAt: fromLocalInput(f.at) }), [keys.notices], t("nt.posted"));
  function go() {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 3) e.title = t("val.title");
    if (f.body.trim().length < 5) e.body = t("val.body");
    setErr(e);
    if (!Object.keys(e).length) void m.mutateAsync(undefined).then(onClose).catch(() => undefined);
  }
  return (
    <Modal open onClose={onClose} title={t("nt.compose")} footer={<><Btn onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={m.isPending} onClick={go}>{t("nt.post")}</Btn></>}>
      <Field label={t("nt.title")} error={err.title}><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-invalid={!!err.title} /></Field>
      <Field label={t("nt.body")} error={err.body}><textarea className="textarea" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} aria-invalid={!!err.body} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("nt.audience")}><select className="select" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as Notice["audience"] })}><option value="all">{t("nt.aud.all")}</option><option value="class">{t("nt.aud.classonly")}</option><option value="teachers">{t("nt.aud.teachers")}</option></select></Field>
        {f.audience === "class" ? <Field label={t("col.class")}><select className="select" value={f.classNo} onChange={(e) => setF({ ...f, classNo: Number(e.target.value) })}>{Array.from({ length: 10 }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}</option>)}</select></Field> : <div />}
      </div>
      <Field label={t("nt.schedule")}><input className="input" type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />{t("nt.pin")}</label>
    </Modal>
  );
}
