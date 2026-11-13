import type { Season } from "@/api/contracts";
import { dhakaMonth } from "./dates";

export const SEASONS: Season[] = ["admission", "exam", "result", "event"];

export function seasonFromCalendar(d: Date = new Date()): Season {
  const m = dhakaMonth(d);
  if (m === 1 || m === 2) return "admission";
  if (m === 5 || m === 6 || m === 11 || m === 12) return "exam";
  if (m === 7 || m === 3) return "result";
  return "event";
}

export const SEASON_ACCENT: Record<Season, string> = {
  admission: "#0F766E",
  exam: "#0F172A",
  result: "#14B8A6",
  event: "#0F766E",
};
