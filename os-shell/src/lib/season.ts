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
  admission: "#4f7cac",
  exam: "#c27a1a",
  result: "#2f855a",
  event: "#b8486b",
};
