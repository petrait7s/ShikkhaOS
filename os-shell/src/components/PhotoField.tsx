"use client";
import { Camera, Trash2 } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Avatar, Btn } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fileToAvatar } from "@/lib/image";

export function PhotoField({ name, photo, onChange, disabled }: { name: string; photo: string | null | undefined; onChange: (v: string | null) => void; disabled?: boolean }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    try { onChange(await fileToAvatar(file)); } catch (e) { toast.error(e instanceof Error ? e.message : t("error.generic")); }
  }
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} size={84} photo={photo} />
      <div className="grid gap-1.5">
        <div className="flex gap-2">
          <Btn size="sm" disabled={disabled} onClick={() => input.current?.click()}><Camera size={13} />{photo ? t("photo.change") : t("photo.add")}</Btn>
          {photo ? <Btn size="sm" disabled={disabled} onClick={() => onChange(null)}><Trash2 size={13} />{t("photo.remove")}</Btn> : null}
        </div>
        <span className="faint text-[11px]">{t("photo.hint")}</span>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}
