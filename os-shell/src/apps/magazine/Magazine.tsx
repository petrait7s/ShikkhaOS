"use client";
import { isAdmin } from "@/lib/roles";
import { BookOpen, Check, PenLine, Plus, Send, X } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Article, Issue } from "@/api/contracts";
import { repos } from "@/api/factory";
import { keys, useArticlesQ, useIssuesQ, useMut } from "@/api/hooks";
import { Badge, Btn, Empty, ErrorBox, Field, Modal, SkeletonRows } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useUI } from "@/store/ui";

export function Cover({ issue, size = 150 }: { issue: Pick<Issue, "title" | "titleBn" | "hue">; size?: number }) {
  const { lang } = useT();
  const h = issue.hue;
  const title = lang === "bn" ? issue.titleBn : issue.title;
  return (
    <svg width={size} height={size * 1.32} viewBox="0 0 150 198" role="img" aria-label={title} className="shrink-0 rounded-xl" style={{ boxShadow: "var(--shadow)" }}>
      <rect width="150" height="198" fill={`hsl(${h} 40% 92%)`} />
      <circle cx="120" cy="40" r="56" fill={`hsl(${h} 50% 78%)`} opacity=".7" />
      <circle cx="30" cy="170" r="70" fill={`hsl(${(h + 40) % 360} 45% 70%)`} opacity=".45" />
      <path d={`M0 140 Q40 ${110 + (h % 30)} 80 140 T150 130 V198 H0Z`} fill={`hsl(${h} 45% 35%)`} opacity=".85" />
      <rect x="14" y="18" width="40" height="4" rx="2" fill={`hsl(${h} 45% 30%)`} />
      <foreignObject x="14" y="34" width="122" height="70"><div style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: 19, lineHeight: 1.2, color: `hsl(${h} 45% 22%)` }}>{title}</div></foreignObject>
    </svg>
  );
}

type Tab = "read" | "submit" | "review" | "issues";

export default function Magazine() {
  const { t } = useT();
  const role = useUI((s) => s.session?.role);
  const reg = isAdmin(role);
  const [tab, setTab] = useState<Tab>("read");
  const tabs: Tab[] = reg ? ["read", "review", "issues"] : ["read", "submit"];
  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="border-b p-3" style={{ borderColor: "var(--line)" }}>
        <div className="inline-flex rounded-lg p-0.5" style={{ background: "var(--paper-2)" }} role="tablist">
          {tabs.map((k) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cn("h-7 rounded-md px-3 text-[12px] font-semibold")} style={{ background: tab === k ? "var(--card)" : "transparent" }}>{t(`mag.tab.${k}`)}</button>)}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">{tab === "read" ? <Read /> : tab === "submit" ? <Submit /> : tab === "review" ? <Review /> : <Issues />}</div>
    </div>
  );
}

function Read() {
  const { t } = useT();
  const issues = useIssuesQ();
  const articles = useArticlesQ();
  const [open, setOpen] = useState<Article | null>(null);
  if (issues.isLoading || articles.isLoading) return <SkeletonRows rows={5} />;
  if (issues.isError) return <ErrorBox error={issues.error} />;
  const pub = (issues.data ?? []).filter((i) => i.status === "published");
  if (pub.length === 0) return <Empty title={t("mag.empty")} icon={<BookOpen size={22} />} />;
  return (
    <div className="grid gap-6 p-4">
      {pub.map((i) => (
        <section key={i.id} className="flex flex-col gap-4 sm:flex-row">
          <Cover issue={i} />
          <div className="min-w-0 flex-1">
            <h3 className="serif-bn mb-2 text-xl font-bold">{i.title}</h3>
            <ul className="grid gap-2">
              {(articles.data ?? []).filter((a) => a.issueId === i.id && a.status === "published").map((a) => (
                <li key={a.id}><button type="button" className="hair w-full p-3 text-left" onClick={() => setOpen(a)}><div className={cn("font-bold", a.lang === "bn" && "serif-bn")}>{a.title}</div><div className="faint text-[12px]">{a.author}</div></button></li>
              ))}
            </ul>
          </div>
        </section>
      ))}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ""} width={640} footer={<Btn onClick={() => setOpen(null)}>{t("close")}</Btn>}>
        {open ? <article className={cn("text-[15px] leading-7 [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3", open.lang === "bn" && "serif-bn")}><div className="faint mb-3 text-[12px]">{open.author}</div><ReactMarkdown>{open.body}</ReactMarkdown></article> : null}
      </Modal>
    </div>
  );
}

function Submit() {
  const { t } = useT();
  const [f, setF] = useState({ title: "", lang: "en" as "en" | "bn", body: "" });
  const m = useMut(() => repos.magazine.submit({ title: f.title.trim(), lang: f.lang, body: f.body.trim() }), [keys.articles], t("mag.submitted"));
  const bad = f.title.trim().length < 3 || f.body.trim().length < 20;
  return (
    <div className="mx-auto max-w-[640px] p-4">
      <p className="muted mb-3 text-[13px]">{t("mag.submit.note")}</p>
      <Field label={t("nt.title")}><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label={t("mag.lang")}><select className="select" value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value as "en" | "bn" })}><option value="en">English</option><option value="bn">বাংলা</option></select></Field>
      <Field label={t("mag.body")}><textarea className="textarea !min-h-[200px]" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <div className="faint mb-3 text-[12px]">{t("mag.markdown.tip")}</div>
      <Btn variant="primary" disabled={bad || m.isPending} onClick={() => void m.mutateAsync(undefined).then(() => setF({ title: "", lang: "en", body: "" })).catch(() => undefined)}><Send size={14} />{t("mag.submit")}</Btn>
    </div>
  );
}

function Review() {
  const { t } = useT();
  const articles = useArticlesQ();
  const issues = useIssuesQ();
  const [edit, setEdit] = useState<Article | null>(null);
  const [issueFor, setIssueFor] = useState<Record<string, string>>({});
  const review = useMut((v: { id: string; d: "approve" | "reject"; issueId: string | null }) => repos.magazine.review(v.id, v.d, v.issueId), [keys.articles], t("mag.reviewed"));
  if (articles.isLoading) return <SkeletonRows />;
  const pending = (articles.data ?? []).filter((a) => a.status === "pending");
  const drafts = (issues.data ?? []).filter((i) => i.status === "draft");
  const pickIssue = (id: string) => issueFor[id] ?? (drafts[0]?.id ?? (issues.data ?? [])[0]?.id ?? "");
  return (
    <div className="p-4">
      {pending.length === 0 ? <Empty title={t("mag.review.none")} icon={<Check size={22} />} /> : (
        <ul className="grid gap-2">{pending.map((a) => (
          <li key={a.id} className="card flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1"><div className={cn("font-bold", a.lang === "bn" && "serif-bn")}>{a.title}</div><div className="faint text-[12px]">{a.author} · {a.lang === "bn" ? "বাংলা" : "English"}</div></div>
            <Btn size="sm" onClick={() => setEdit(a)}><PenLine size={13} />{t("mag.edit")}</Btn>
            <select className="select !h-8 !w-auto" aria-label={t("mag.issue")} value={pickIssue(a.id)} onChange={(e) => setIssueFor({ ...issueFor, [a.id]: e.target.value })}>{(issues.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select>
            <Btn variant="primary" size="sm" disabled={review.isPending || !pickIssue(a.id)} onClick={() => review.mutate({ id: a.id, d: "approve", issueId: pickIssue(a.id) })}><Check size={13} />{t("ap.approve")}</Btn>
            <Btn size="sm" onClick={() => review.mutate({ id: a.id, d: "reject", issueId: null })}><X size={13} />{t("ap.reject")}</Btn>
          </li>))}</ul>
      )}
      {edit ? <Editor article={edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function Editor({ article, onClose }: { article: Article; onClose: () => void }) {
  const { t } = useT();
  const [title, setTitle] = useState(article.title);
  const [body, setBody] = useState(article.body);
  const save = useMut(() => repos.magazine.saveArticle(article.id, { title, body }), [keys.articles], t("set.saved"));
  return (
    <Modal open onClose={onClose} title={t("mag.edit")} width={900} footer={<><Btn onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={save.isPending} onClick={() => void save.mutateAsync(undefined).then(onClose).catch(() => undefined)}>{t("save")}</Btn></>}>
      <Field label={t("nt.title")}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("mag.body")}><textarea className="textarea !min-h-[260px] font-mono" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div><span className="label">{t("mag.preview")}</span><article className={cn("hair min-h-[260px] p-3 text-[14px] leading-6 [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2", article.lang === "bn" && "serif-bn")}><ReactMarkdown>{body}</ReactMarkdown></article></div>
      </div>
    </Modal>
  );
}

function Issues() {
  const { t } = useT();
  const issues = useIssuesQ();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [titleBn, setTitleBn] = useState("");
  const create = useMut(() => repos.magazine.createIssue(title.trim(), titleBn.trim()), [keys.issues], t("mag.issue.created"));
  const publish = useMut((id: string) => repos.magazine.publishIssue(id), [keys.issues], t("mag.issue.published"));
  if (issues.isLoading) return <SkeletonRows />;
  return (
    <div className="p-4">
      <div className="mb-3 flex justify-end"><Btn variant="primary" onClick={() => setOpen(true)}><Plus size={14} />{t("mag.issue.new")}</Btn></div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
        {(issues.data ?? []).map((i) => (
          <div key={i.id} className="flex flex-col items-start gap-2"><Cover issue={i} /><div className="text-[13px] font-bold">{i.title}</div>{i.status === "published" ? <Badge tone="ok">{t("state.published")}</Badge> : <Btn size="sm" variant="primary" disabled={publish.isPending} onClick={() => publish.mutate(i.id)}>{t("mag.issue.publish")}</Btn>}</div>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t("mag.issue.new")} footer={<><Btn onClick={() => setOpen(false)}>{t("cancel")}</Btn><Btn variant="primary" disabled={title.trim().length < 3 || create.isPending} onClick={() => void create.mutateAsync(undefined).then(() => { setOpen(false); setTitle(""); setTitleBn(""); }).catch(() => undefined)}>{t("create")}</Btn></>}>
        <Field label={t("mag.issue.title")}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={t("mag.issue.titlebn")}><input className="input" value={titleBn} onChange={(e) => setTitleBn(e.target.value)} /></Field>
        <div className="flex justify-center"><Cover issue={{ title: title || "…", titleBn: titleBn || title || "…", hue: 200 }} size={120} /></div>
      </Modal>
    </div>
  );
}
