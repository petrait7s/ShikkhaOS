// Client-side validation mirroring contract C15 (server remains authoritative).
import { z } from "zod";

export const username = z.string().regex(/^[a-z0-9._-]{3,32}$/, "3–32 characters: a-z 0-9 . _ -");
const COMMON = ["password123", "1234567890", "qwerty12345", "password1234", "admin12345", "letmein1234", "iloveyou123"];
export const password = z.string().min(10, "At least 10 characters").refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Must contain a letter and a digit").refine((p) => !COMMON.includes(p.toLowerCase()), "Password is too common");
export const phoneBd = z.string().regex(/^(\+88)?01\d{9}$/, "Use 01XXXXXXXXX or +8801XXXXXXXXX");
export const studentCode = z.string().regex(/^[A-Z0-9-]{4,20}$/, "4–20 characters: A-Z 0-9 -");
export const loginSchema = z.object({ identifier: z.string().min(1, "Required"), password: z.string().min(1, "Required") });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password }).refine((v) => v.currentPassword !== v.newPassword, { path: ["newPassword"], message: "New password must differ" });

export interface MarkCheck { ok: boolean; message?: string }
/** Marks cell validation: 0..full, max 2 decimals, null only when absent (blank allowed while drafting). */
export function checkMarks(raw: string, full: number, absent: boolean): MarkCheck {
  if (absent) return raw.trim() === "" ? { ok: true } : { ok: false, message: "Absent students have no marks" };
  if (raw.trim() === "") return { ok: true };
  if (!/^\d+(\.\d{1,2})?$/.test(raw.trim())) return { ok: false, message: "Number with up to 2 decimals" };
  const n = Number(raw);
  return n >= 0 && n <= full ? { ok: true } : { ok: false, message: `Must be between 0 and ${full}` };
}
