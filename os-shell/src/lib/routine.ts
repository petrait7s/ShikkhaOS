import type { RoutineSlot } from "@/api/contracts";

export const PERIOD_COUNT = 6;
export const PERIODS: { n: number; start: string; end: string }[] = [
  { n: 1, start: "09:00", end: "09:45" },
  { n: 2, start: "09:45", end: "10:30" },
  { n: 3, start: "10:30", end: "11:15" },
  { n: 4, start: "11:45", end: "12:30" },
  { n: 5, start: "12:30", end: "13:15" },
  { n: 6, start: "13:15", end: "14:00" },
];
export const BREAK_AFTER = 3;
export const DAYS: { en: string; bn: string }[] = [
  { en: "Sunday", bn: "রবিবার" }, { en: "Monday", bn: "সোমবার" }, { en: "Tuesday", bn: "মঙ্গলবার" },
  { en: "Wednesday", bn: "বুধবার" }, { en: "Thursday", bn: "বৃহস্পতিবার" },
];

/** Dhaka weekday index with Sunday = 0 (school days are Sun–Thu = 0–4). Returns -1 on Fri/Sat. */
export function dhakaSchoolDay(now: number): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", weekday: "short" }).format(new Date(now));
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4 };
  return map[wd] ?? -1;
}

export function dhakaMinutes(now: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(now));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

const mins = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Current period (if any) and the next upcoming slot from a person's slots. */
export function currentAndNext(slots: RoutineSlot[], now: number): { current: RoutineSlot | null; next: RoutineSlot | null; day: number } {
  const day = dhakaSchoolDay(now);
  const m = dhakaMinutes(now);
  const today = day < 0 ? [] : slots.filter((s) => s.day === day).sort((a, b) => a.period - b.period);
  let current: RoutineSlot | null = null;
  let next: RoutineSlot | null = null;
  for (const s of today) {
    const p = PERIODS.find((x) => x.n === s.period);
    if (!p) continue;
    if (m >= mins(p.start) && m < mins(p.end)) current = s;
    else if (m < mins(p.start) && !next) next = s;
  }
  return { current, next, day };
}

export const periodTime = (n: number): string => {
  const p = PERIODS.find((x) => x.n === n);
  return p ? `${p.start}–${p.end}` : "";
};
