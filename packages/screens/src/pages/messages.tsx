import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Conversation, Message } from "@shikkhaos/types";
import { newId } from "@shikkhaos/api-client";
import { useApp, useAction, useGet, useList, usePagedList, useRealtimeInvalidate } from "../context";
import { Badge, Button, Empty, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, errText, fmtDateTime, useToast } from "../ui";

interface Recipient { userId: string; displayName: string; role: string; detail: string | null }

export function Messages() {
  const { id } = useParams(); const navigate = useNavigate(); const { auth } = useApp();
  useRealtimeInvalidate(["message.created", "conversation.created", "conversation.read", "message.deleted"], ["/conversations"]);
  const convs = useList<Conversation>("/conversations", undefined, { refetchInterval: 30_000 }); const [newDm, setNewDm] = React.useState(false);
  const active = convs.data?.find((c) => c.id === id);
  const title = (c: Conversation) => c.type === "DIRECT" ? c.peer?.displayName ?? "Direct message" : c.title ?? "Channel";
  const canNew = auth.permissions.includes("messages.send_direct");
  return <>
    <PageHeader title="Messages" sub="Direct messages, class groups and school channels" actions={canNew ? <Button variant="primary" onClick={() => setNewDm(true)}>New message</Button> : null} />
    <div className="card chat">
      <div className="list" role="list" aria-label="Conversations">{convs.isLoading ? <div style={{ padding: 12 }}><Skeleton /></div> : convs.error ? <ErrorState error={convs.error} onRetry={() => void convs.refetch()} /> : !convs.data!.length ? <Empty title="No conversations yet">{canNew ? "Start a new message." : "Your class group appears once you are enrolled."}</Empty> :
        convs.data!.map((c) => <button key={c.id} className="conv" role="listitem" aria-current={c.id === id} onClick={() => navigate(`/messages/${c.id}`)}><div className="row"><strong>{title(c)}</strong><span className="spacer" />{c.unread ? <Badge tone="info">{c.unread}</Badge> : null}</div><div className="faint" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.type === "CLASS_GROUP" ? "Class group · " : c.type === "CHANNEL" ? "Channel · " : ""}{c.lastMessage?.preview ?? "No messages yet"}</div></button>)}</div>
      {active ? <Thread key={active.id} conv={active} title={title(active)} /> : <div className="thread"><Empty title="Select a conversation" /></div>}
    </div>
    {newDm ? <NewDm onClose={() => setNewDm(false)} onOpen={(cid) => { setNewDm(false); navigate(`/messages/${cid}`); }} /> : null}
  </>;
}

function Thread({ conv, title }: { conv: Conversation; title: string }) {
  const { api, rt, auth } = useApp(); const toast = useToast();
  const msgs = usePagedList<Message>(`/conversations/${conv.id}/messages`);
  const [body, setBody] = React.useState(""); const [live, setLive] = React.useState<Message[]>([]); const [typing, setTyping] = React.useState(false); const [report, setReport] = React.useState<Message | null>(null);
  const canPost = conv.type === "DIRECT" || (conv.type === "CLASS_GROUP" && (auth.role !== "STUDENT" || conv.studentsCanPost)) || (conv.type === "CHANNEL" && (conv.channelKind === "ANNOUNCEMENTS" ? auth.permissions.includes("channels.post_official") : auth.role !== "STUDENT"));
  React.useEffect(() => { void api.post(`/conversations/${conv.id}/read`).catch(() => {}); }, [api, conv.id, msgs.data?.data.length]);
  React.useEffect(() => {
    const offs = [rt.on("message.created", (p) => { if (p.conversationId === conv.id || p.conversation_id === conv.id) { setLive((l) => (l.some((m) => m.id === p.id) ? l : [{ id: p.id, conversationId: conv.id, senderId: p.senderId, body: p.body ?? "", kind: p.kind ?? "TEXT", attachmentFileIds: [], createdAt: p.createdAt }, ...l])); void msgs.refetch(); } }),
      rt.on("typing", (p) => { if (p.conversationId === conv.id) { setTyping(!!p.typing); if (p.typing) setTimeout(() => setTyping(false), 4000); } }), rt.on("ws.open", () => void msgs.refetch())];
    return () => offs.forEach((f) => f());
  }, [rt, conv.id]);
  const all = [...live.filter((l) => !msgs.rows.some((m) => m.id === l.id)), ...msgs.rows];
  const send = useAction(async () => { const text = body.trim(); if (!text) return; const cid = newId(); setBody(""); try { await api.post(`/conversations/${conv.id}/messages`, { body: text, clientMessageId: cid }, { idempotencyKey: cid }); void msgs.refetch(); } catch (e) { setBody(text); throw e; } }, { invalidate: ["/conversations"] });
  const typingRef = React.useRef(0);
  const onType = (v: string) => { setBody(v); if (Date.now() - typingRef.current > 2500) { typingRef.current = Date.now(); rt.send("typing.start", { conversationId: conv.id }); } };
  const del = useAction((m: Message) => api.del(`/messages/${m.id}`), { invalidate: ["/conversations"], success: "Deleted", onSuccess: () => void msgs.refetch() });
  return (
    <div className="thread">
      <div className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><h2>{title}</h2><span className="spacer" />{conv.type === "CLASS_GROUP" && auth.role === "STUDENT" && !conv.studentsCanPost ? <Badge>Read-only for students</Badge> : null}{conv.type === "CLASS_GROUP" && auth.role === "TEACHER" ? <label className="row"><input type="checkbox" checked={conv.studentsCanPost} onChange={(e) => void api.patch(`/conversations/${conv.id}`, { studentsCanPost: e.target.checked }).then(() => { toast("Updated"); }).catch((x) => toast(errText(x), "bad"))} /> Students can post</label> : null}</div>
      <div className="msgs" role="log" aria-live="polite">
        {msgs.isLoading && !all.length ? <Skeleton /> : msgs.error ? <ErrorState error={msgs.error} onRetry={() => void msgs.refetch()} /> : all.length === 0 ? <Empty title="No messages yet" /> : all.map((m) => { const mine = m.senderId === auth.user.id; return (
          <div key={m.id} className={`bubble ${mine ? "me" : ""} ${m.kind === "CLASS_TEST_SHARED" ? "sys" : ""}`}>{!mine ? <div className="who">{m.senderName ?? "—"}{m.senderRole ? ` · ${m.senderRole.toLowerCase()}` : ""}</div> : null}<div>{m.body}</div>
            <div className="who">{fmtDateTime(m.createdAt)} {mine && !m.deletedAt ? <button className="btn ghost sm" style={{ color: "inherit" }} onClick={() => del.mutate(m)}>delete</button> : !mine ? <button className="btn ghost sm" onClick={() => setReport(m)}>report</button> : null}</div></div>); })}
        {msgs.hasMore ? <Button size="sm" onClick={msgs.loadMore}>Load earlier messages</Button> : null}
      </div>
      {typing ? <div className="faint" style={{ padding: "0 14px" }}>typing…</div> : null}
      {canPost ? <form className="composer" onSubmit={(e) => { e.preventDefault(); send.mutate(undefined); }}><Input aria-label="Message" placeholder="Write a message" value={body} maxLength={4000} onChange={(e) => onType(e.target.value)} /><Button variant="primary" type="submit" disabled={!body.trim()}>Send</Button></form> : <div className="composer faint">You can read this conversation but not post in it.</div>}
      {report ? <ReportDialog m={report} onClose={() => setReport(null)} /> : null}
    </div>
  );
}

function ReportDialog({ m, onClose }: { m: Message; onClose: () => void }) {
  const { api } = useApp(); const [reason, setReason] = React.useState("");
  const send = useAction(() => api.post(`/messages/${m.id}/report`, { reason }), { success: "Reported to school staff", onSuccess: onClose });
  return <Modal title="Report message" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={send.isPending} disabled={reason.trim().length < 3} onClick={() => send.mutate(undefined)}>Report</Button></>}><div className="stack"><div className="muted">"{m.body.slice(0, 120)}"</div><Field label="What is wrong with it?"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div></Modal>;
}

function NewDm({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const { api } = useApp(); const [q, setQ] = React.useState(""); const [who, setWho] = React.useState("");
  const rec = useGet<Recipient[]>("/messaging/recipients", { q });
  const go = useAction(() => api.post<{ id: string }>("/conversations", { type: "DIRECT", recipientId: who }), { invalidate: ["/conversations"], onSuccess: (c) => onOpen(c.id) });
  return <Modal title="New message" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={go.isPending} disabled={!who} onClick={() => go.mutate(undefined)}>Start conversation</Button></>}>
    <div className="stack"><div className="faint">You can message the people the school allows for your role.</div><Field label="Search people"><Input value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      {rec.isLoading ? <Skeleton /> : rec.error ? <ErrorState error={rec.error} /> : !rec.data!.length ? <Empty title="No one available" /> : <Select size={8} aria-label="Recipients" value={who} onChange={(e) => setWho(e.target.value)} style={{ height: 200 }}>{rec.data!.map((r) => <option key={r.userId} value={r.userId}>{r.displayName} — {r.role.toLowerCase()}{r.detail ? ` (${r.detail})` : ""}</option>)}</Select>}</div></Modal>;
}
