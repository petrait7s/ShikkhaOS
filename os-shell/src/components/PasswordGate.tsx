"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { call, mustChange } from "@/api/http/client";
import { Btn, Modal } from "@/components/ui";

/** Live mode: blocks the app until a temporary password has been replaced. */
export function PasswordGate() {
  const [need, setNeed] = useState(false);
  const [cur, setCur] = useState(""), [pw, setPw] = useState(""), [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    const sync = () => setNeed(mustChange.get());
    sync();
    window.addEventListener("shikkaos:mustchange", sync);
    return () => window.removeEventListener("shikkaos:mustchange", sync);
  }, []);
  async function go() {
    setErr(null);
    if (pw !== pw2) return setErr("The two new passwords do not match.");
    setBusy(true);
    try {
      await call("POST", "/auth/change-password", { body: { currentPassword: cur, newPassword: pw } });
      mustChange.set(false); setCur(""); setPw(""); setPw2("");
      toast.success("Password changed.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not change the password."); } finally { setBusy(false); }
  }
  return (
    <Modal open={need} onClose={() => undefined} title="Choose a new password" width={440}
      footer={<Btn variant="primary" disabled={busy || !cur || !pw || !pw2} onClick={() => void go()}>Save new password</Btn>}>
      <form onSubmit={(e) => { e.preventDefault(); void go(); }} className="grid gap-3">
        <p className="muted text-[13px]">You signed in with a temporary password. Choose your own password to continue (at least 10 characters, with letters and numbers).</p>
        <div><label className="label" htmlFor="pg-cur">Temporary password</label><input id="pg-cur" className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div><label className="label" htmlFor="pg-new">New password</label><input id="pg-new" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div><label className="label" htmlFor="pg-new2">Repeat new password</label><input id="pg-new2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        {err ? <div className="field-error" role="alert">{err}</div> : null}
      </form>
    </Modal>
  );
}
