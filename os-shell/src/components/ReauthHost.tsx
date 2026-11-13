"use client";
import { useEffect, useRef, useState } from "react";
import { registerReauthPrompt } from "@/api/http/reauth";
import { Btn, Modal } from "@/components/ui";

/** Password re-confirmation for approving/publishing (live API mode). */
export function ReauthHost() {
  const [reason, setReason] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);

  useEffect(() => {
    registerReauthPrompt((why) => new Promise<string | null>((resolve) => { resolver.current = resolve; setPw(""); setReason(why); }));
    return () => registerReauthPrompt(null);
  }, []);

  const close = (v: string | null) => { resolver.current?.(v); resolver.current = null; setReason(null); setPw(""); };

  return (
    <Modal
      open={reason !== null}
      onClose={() => close(null)}
      title="Confirm with your password"
      width={420}
      footer={<><Btn onClick={() => close(null)}>Cancel</Btn><Btn variant="primary" disabled={!pw} onClick={() => close(pw)}>Confirm</Btn></>}
    >
      <form onSubmit={(e) => { e.preventDefault(); if (pw) close(pw); }}>
        <p className="muted mb-3 text-[13px]">{reason}</p>
        <label className="label" htmlFor="reauth-pw">Password</label>
        <input id="reauth-pw" className="input" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </form>
    </Modal>
  );
}
