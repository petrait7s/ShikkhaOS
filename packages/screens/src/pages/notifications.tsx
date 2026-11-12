import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { NotificationItem } from "@shikkhaos/types";
import { useApp, useAction, usePagedList } from "../context";
import { Badge, Button, Empty, ErrorState, PageHeader, Select, Skeleton, fmtDateTime } from "../ui";
import { deepLinkToRoute } from "../app";

export function NotificationsPage() {
  const { api } = useApp(); const navigate = useNavigate(); const [type, setType] = React.useState(""); const q = usePagedList<NotificationItem>("/notifications", { type });
  const readAll = useAction(() => api.post("/notifications/read-all"), { invalidate: ["/notifications"], success: "All marked read" });
  const open = async (n: NotificationItem) => { if (!n.readAt) await api.post(`/notifications/${n.id}/read`).catch(() => {}); navigate(deepLinkToRoute(n.data?.deepLink?.replace("shikkhaos://", "") ?? "")); };
  return <>
    <PageHeader title="Notifications" actions={<Button onClick={() => readAll.mutate(undefined)}>Mark all read</Button>} />
    <div className="row" style={{ marginBottom: 12 }}><Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 240 }}><option value="">All types</option>{["RESULT_PUBLISHED", "RESULT_REVISED", "MARKS_SUBMITTED", "CORRECTION_REQUESTED", "SUBMISSION_VERIFIED", "RESULTS_AWAITING_APPROVAL", "CLASS_TEST_SHARED", "ATTENDANCE_ABSENT", "HOMEWORK_ASSIGNED", "HOMEWORK_DUE_SOON", "HOMEWORK_GRADED", "NOTICE_PUBLISHED", "MESSAGE_RECEIVED", "MESSAGE_REPORTED", "EXAM_AUTHORIZED", "ACCOUNT_SECURITY"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase()}</option>)}</Select></div>
    <div className="card">{q.isLoading && !q.rows.length ? <div style={{ padding: 16 }}><Skeleton rows={6} /></div> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.rows.length === 0 ? <Empty title="No notifications" /> :
      q.rows.map((n) => <button key={n.id} className="nav-item" style={{ display: "block", borderBottom: "1px solid var(--border)", borderRadius: 0, padding: 14 }} onClick={() => void open(n)}><div className="row"><strong style={{ fontWeight: n.readAt ? 500 : 700 }}>{n.title}</strong>{!n.readAt ? <Badge tone="info">new</Badge> : null}<span className="spacer" /><span className="faint">{fmtDateTime(n.createdAt)}</span></div><div className="muted">{n.body}</div></button>)}
      {q.hasMore ? <div style={{ padding: 12, textAlign: "center" }}><Button onClick={q.loadMore}>Load more</Button></div> : null}</div></>;
}
