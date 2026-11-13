const TZ = "Asia/Dhaka";

export function fmtDate(iso: string, lang: "en" | "bn" = "en"): string {
  return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function fmtDateTime(iso: string, lang: "en" | "bn" = "en"): string {
  return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function dhakaMonth(d: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "numeric" }).format(d));
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const dh = new Date(d.getTime() + 6 * 3600_000);
  return `${dh.getUTCFullYear()}-${p(dh.getUTCMonth() + 1)}-${p(dh.getUTCDate())}T${p(dh.getUTCHours())}:${p(dh.getUTCMinutes())}`;
}

export function fromLocalInput(v: string): string {
  return new Date(`${v}:00+06:00`).toISOString();
}

export function countdown(iso: string, now: number): string {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}`;
}
