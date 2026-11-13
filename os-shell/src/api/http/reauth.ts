// Approving/publishing needs the password typed again. The UI registers a prompt (ReauthHost);
// the API layer asks it for a password, exchanges it for a short-lived re-auth token and sends that token with the request.
import { ApiError } from "../mock/db";
import { call } from "./client";

type Prompt = (reason: string) => Promise<string | null>;
let prompt: Prompt | null = null;
let cached: { token: string; at: number } | null = null;

export const registerReauthPrompt = (p: Prompt | null) => { prompt = p; };

/** Returns headers carrying a fresh X-Reauth-Token (asks for the password if none is cached). */
export async function reauthHeaders(reason: string): Promise<Record<string, string>> {
  if (cached && Date.now() - cached.at < 90_000) return { "X-Reauth-Token": cached.token };
  if (!prompt) throw new ApiError("Password confirmation is not available here.", "reauth_unavailable");
  const pw = await prompt(reason);
  if (!pw) throw new ApiError("Cancelled.", "cancelled");
  try {
    const r = await call<{ reauthToken: string }>("POST", "/auth/reauth", { body: { password: pw } });
    cached = { token: r.data.reauthToken, at: Date.now() };
    return { "X-Reauth-Token": cached.token };
  } catch {
    throw new ApiError("That password is not correct.", "reauth_failed");
  }
}

export const forgetReauth = () => { cached = null; };
