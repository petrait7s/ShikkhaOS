"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, MessageSquarePlus, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMut } from "@/api/hooks";
import { Btn, Empty, ErrorBox, Modal, SkeletonRows } from "@/components/ui";
import { useUI } from "@/store/ui";
import { conversations, markRead, messagesOf, recipients, reportMessage, sendMessage, startDirect, type Conv } from "../live/api";

const ROLE: Record<string, string> = { HEADMASTER: "Headmaster", REGISTRAR: "Registrar", TEACHER: "Teacher", STUDENT: "Student" };
const title = (c: Conv) => c.peer?.displayName ?? c.title ?? "Conversation";
const time = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Messages() {
  const me = useUI((s) => s.session);
  const qc = useQueryClient();
  const convs = useQuery({ queryKey: ["msg", "convs"], queryFn: conversations, refetchInterval: 8000 });
  const [selId, setSelId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const sel = (convs.data ?? []).find((c) => c.id === selId) ?? null;
  useEffect(() => { if (!selId && convs.data?.[0]) setSelId(convs.data[0].id); }, [convs.data, selId]);
  if (convs.isLoading) return <SkeletonRows />;
  if (convs.error) return <ErrorBox error={convs.error} retry={() => void convs.refetch()} />;
  const list = convs.data ?? [];
  return (
    <div className="flex h-full min-h-[420px] flex-col sm:flex-row">
      <aside className="scroll-thin max-h-[38%] shrink-0 overflow-auto border-b p-2 sm:max-h-none sm:w-[260px] sm:border-b-0 sm:border-r" style={{ borderColor: "var(--line)" }}>
        <Btn className="mb-2 w-full" onClick={() => setNewOpen(true)}><MessageSquarePlus size={14} />New message</Btn>
        {list.length === 0 ? <Empty title="No conversations" /> : (
          <ul className="grid gap-1">{list.map((c) => (
            <li key={c.id}><button type="button" onClick={() => setSelId(c.id)} className="list-row w-full !p-2 text-left" style={c.id === selId ? { background: "var(--hover)" } : undefined}>
              <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold">{title(c)}</div>
                <div className="faint truncate text-[12px]">{c.lastMessage?.preview || (c.type === "CHANNEL" ? "Announcements" : c.type === "CLASS_GROUP" ? "Class group" : "No messages yet")}</div></div>
              {c.unread > 0 ? <span className="count-badge !static">{c.unread}</span> : null}</button></li>))}</ul>)}
      </aside>
      <div className="min-w-0 flex-1">{sel ? <Thread key={sel.id} conv={sel} myId={me?.userId ?? ""} onSent={() => void qc.invalidateQueries({ queryKey: ["msg", "convs"] })} /> : <Empty title="Select a conversation" />}</div>
      {newOpen ? <NewModal onClose={() => setNewOpen(false)} onOpened={(id) => { setNewOpen(false); void qc.invalidateQueries({ queryKey: ["msg", "convs"] }).then(() => setSelId(id)); }} /> : null}
    </div>
  );
}

function Thread({ conv, myId, onSent }: { conv: Conv; myId: string; onSent: () => void }) {
  const qc = useQueryClient();
  const msgs = useQuery({ queryKey: ["msg", "thread", conv.id], queryFn: () => messagesOf(conv.id), refetchInterval: 4000 });
  const [text, setText] = useState("");
  const [report, setReport] = useState<string | null>(null), [why, setWhy] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const isStudent = useUI((s) => s.session?.role) === "student";
  const readOnly = conv.type === "CHANNEL" && isStudent;
  useEffect(() => { void markRead(conv.id).then(() => qc.invalidateQueries({ queryKey: ["msg", "convs"] })).catch(() => undefined); }, [conv.id, msgs.data?.length, qc]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.data?.length]);
  const send = useMut(() => sendMessage(conv, text.trim()), [["msg", "thread", conv.id]], undefined);
  const go = () => { if (!text.trim() || send.isPending) return; void send.mutateAsync(undefined).then(() => { setText(""); onSent(); }).catch(() => undefined); };
  const rep = useMut(() => reportMessage(report!, why), [], "Reported to the school. Thank you.");
  const studentCantPost = isStudent && conv.type === "CLASS_GROUP" && !conv.studentsCanPost;
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-2" style={{ borderColor: "var(--line)" }}><div className="font-bold">{title(conv)}</div>
        <div className="faint text-[12px]">{conv.type === "DIRECT" ? ROLE[conv.peer?.role ?? ""] ?? "" : conv.type === "CHANNEL" ? "Official channel" : "Class group"}</div></div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-4">
        {msgs.isLoading ? <SkeletonRows rows={3} /> : msgs.error ? <ErrorBox error={msgs.error} retry={() => void msgs.refetch()} /> : (msgs.data ?? []).length === 0 ? <Empty title="No messages yet" hint="Say hello." /> : (
          <ul className="grid gap-2">{(msgs.data ?? []).map((m) => {
            const mine = m.senderId === myId;
            return (
              <li key={m.id} className={mine ? "justify-self-end" : "justify-self-start"} style={{ maxWidth: "78%" }}>
                {!mine ? <div className="faint mb-0.5 text-[11px]">{m.senderName} {m.senderRole ? `· ${ROLE[m.senderRole] ?? ""}` : ""}</div> : null}
                <div className="rounded-2xl px-3 py-2 text-[13.5px]" style={mine ? { background: "var(--navy)", color: "#fff" } : { background: "var(--card-solid)", boxShadow: "var(--elev-1)" }}>
                  <div className="whitespace-pre-wrap break-words">{m.deletedAt ? <i>Message removed</i> : m.body}</div>
                </div>
                <div className="faint mt-0.5 flex items-center gap-2 text-[11px]">{time(m.createdAt)}
                  {!mine && !m.deletedAt ? <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => { setReport(m.id); setWhy(""); }}><Flag size={10} />Report</button> : null}</div>
              </li>);
          })}</ul>)}
        <div ref={end} />
      </div>
      {readOnly || studentCantPost ? <div className="faint border-t px-4 py-3 text-[12.5px]" style={{ borderColor: "var(--line)" }}>{readOnly ? "Only the school can post here." : "Students can read this group. Teachers can post."}</div> : (
        <form className="flex gap-2 border-t p-3" style={{ borderColor: "var(--line)" }} onSubmit={(e) => { e.preventDefault(); go(); }}>
          <input className="input" aria-label="Message" placeholder="Write a message" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
          <Btn variant="primary" type="submit" disabled={!text.trim() || send.isPending} aria-label="Send"><Send size={14} /></Btn>
        </form>)}
      <Modal open={report !== null} onClose={() => setReport(null)} title="Report this message" width={420}
        footer={<><Btn onClick={() => setReport(null)}>Cancel</Btn><Btn variant="danger" disabled={why.trim().length < 3 || rep.isPending} onClick={() => void rep.mutateAsync(undefined).then(() => setReport(null)).catch(() => undefined)}>Report</Btn></>}>
        <p className="muted mb-2 text-[13px]">The Headmaster will review it. Tell us what is wrong.</p>
        <input className="input" aria-label="Reason" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason" />
      </Modal>
    </div>
  );
}

function NewModal({ onClose, onOpened }: { onClose: () => void; onOpened: (id: string) => void }) {
  const r = useQuery({ queryKey: ["msg", "recipients"], queryFn: recipients });
  const [q, setQ] = useState("");
  const start = useMut((id: string) => startDirect(id), [], undefined);
  const shown = (r.data ?? []).filter((x) => x.displayName.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open onClose={onClose} title="New message" width={440}>
      <input className="input mb-3" aria-label="Search people" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {r.isLoading ? <SkeletonRows rows={4} /> : r.error ? <ErrorBox error={r.error} /> : shown.length === 0 ? <Empty title="No one to message" hint="Students can message their own teachers and the school office." /> : (
        <ul className="grid gap-1">{shown.map((p) => (
          <li key={p.userId}><button type="button" className="list-row w-full !p-2 text-left" onClick={() => void start.mutateAsync(p.userId).then((c) => { toast.success(`Chat with ${p.displayName}`); onOpened(c.data.id); }).catch(() => undefined)}>
            <div className="min-w-0 flex-1"><div className="text-[13px] font-bold">{p.displayName}</div><div className="faint text-[12px]">{p.detail ?? ROLE[p.role] ?? p.role}</div></div></button></li>))}</ul>)}
    </Modal>
  );
}
