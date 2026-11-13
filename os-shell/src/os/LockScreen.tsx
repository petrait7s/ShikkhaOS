"use client";
import { Lock } from "lucide-react";
import { useState } from "react";
import { repos } from "@/api/factory";
import { useMyProfileQ } from "@/api/hooks";
import { Avatar, Btn, Field } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useUI } from "@/store/ui";

export function LockScreen() {
  const { t } = useT();
  const session = useUI((s) => s.session);
  const setLocked = useUI((s) => s.setLocked);
  const touch = useUI((s) => s.touch);
  const me = useMyProfileQ();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="wallpaper fixed inset-0 z-[10000] grid place-items-center px-4" role="dialog" aria-modal="true" aria-label={t("lock.title")}>
      <form
        className="sheet flex w-full max-w-[340px] flex-col items-center gap-3 p-7"
        onSubmit={(e) => {
          e.preventDefault();
          repos.auth.verifyPassword(pw).then((ok) => {
            if (ok) { setPw(""); setErr(null); touch(); setLocked(false); } else setErr(t("lock.wrong"));
          }).catch(() => setErr(t("error.generic")));
        }}
      >
        <Avatar name={session?.name ?? "?"} size={84} photo={me.data?.photo} />
        <div className="font-bold">{session?.name}</div>
        <div className="muted flex items-center gap-1 text-[13px]"><Lock size={13} />{t("lock.title")}</div>
        <div className="w-full"><Field label={t("auth.password")} error={err ?? undefined}><input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></Field></div>
        <Btn variant="primary" className="w-full" type="submit">{t("lock.unlock")}</Btn>
      </form>
    </div>
  );
}
