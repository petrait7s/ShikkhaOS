"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { repos } from "@/api/factory";
import type { CellKey } from "@/api/repositories";
import { keys, useMut } from "@/api/hooks";
import { Btn, Modal, Skeleton } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { fmtBytes, readFileAsDataUrl } from "@/lib/image";

/** Question paper for one exam / class / subject. Teachers upload; the registrar views. */
export function PaperModal({ k, readOnly, onClose }: { k: CellKey; readOnly?: boolean; onClose: () => void }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const id = `${k.examId}-${k.classNo}-${k.section}-${k.subject}`;
  const q = useQuery({ queryKey: keys.paper(id), queryFn: () => repos.marks.paper(k) });
  const done = [keys.paper(id), keys.paperKeys(k.examId)];
  const save = useMut((f: { name: string; mime: string; size: number; dataUrl: string }) => repos.marks.savePaper(k, f), done, () => t("paper.saved"));
  const remove = useMut(() => repos.marks.removePaper(k), done, () => t("paper.removed"));

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      save.mutate({ name: file.name, mime: file.type, size: file.size, dataUrl }, { onSuccess: () => void qc.invalidateQueries({ queryKey: keys.paper(id) }) });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("error.generic")); }
  }

  const p = q.data;
  return (
    <Modal open onClose={onClose} title={`${t("paper.title")} · ${t("rc.class", { c: k.classNo, s: k.section })} ${k.subject}`} width={720}
      footer={<Btn onClick={onClose}>{t("close")}</Btn>}>
      {q.isLoading ? <Skeleton h={160} /> : (
        <div className="grid gap-3">
          {p ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <FileText size={16} /><span className="font-semibold">{p.name}</span><span className="faint">{fmtBytes(p.size)} · {fmtDateTime(p.at, lang)}</span>
                <div className="flex-1" />
                <a className="btn btn-sm" href={p.dataUrl} download={p.name}><Download size={13} />{t("paper.download")}</a>
                {!readOnly ? <Btn size="sm" onClick={() => input.current?.click()}><Upload size={13} />{t("paper.replace")}</Btn> : null}
                {!readOnly ? <Btn size="sm" disabled={remove.isPending} onClick={() => remove.mutate(undefined)}><Trash2 size={13} />{t("photo.remove")}</Btn> : null}
              </div>
              <div className="overflow-hidden rounded-xl" style={{ boxShadow: "0 0 0 0.5px rgba(0,0,0,.2)", background: "var(--card-solid)" }}>
                {p.mime === "application/pdf"
                  ? <iframe title={p.name} src={p.dataUrl} className="h-[52vh] w-full" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={p.dataUrl} alt={p.name} className="mx-auto max-h-[52vh] object-contain" />}
              </div>
            </>
          ) : (
            <div className="grid place-items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center" style={{ borderColor: "var(--line)" }}>
              <FileText size={28} className="faint" />
              <div className="font-semibold">{t("paper.none")}</div>
              {readOnly ? <div className="muted text-[13px]">{t("paper.none.reg")}</div> : (
                <>
                  <div className="muted max-w-sm text-[13px]">{t("paper.none.hint")}</div>
                  <Btn variant="primary" disabled={save.isPending} onClick={() => input.current?.click()}><Upload size={14} />{t("paper.upload")}</Btn>
                </>
              )}
            </div>
          )}
          <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      )}
    </Modal>
  );
}
