"use client";
import { useSchoolQ } from "@/api/hooks";
import type { Season } from "@/api/contracts";
import { seasonFromCalendar } from "@/lib/season";

export function useSeason(): Season {
  const { data } = useSchoolQ();
  return data?.seasonOverride ?? seasonFromCalendar();
}
