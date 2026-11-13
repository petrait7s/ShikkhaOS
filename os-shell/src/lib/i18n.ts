"use client";
import { useSyncExternalStore } from "react";
import { useUI, type Lang } from "@/store/ui";
import { dict } from "./dict";
import { toBnDigits } from "./utils";

const subscribe = () => () => undefined;
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export type TFn = (key: string, params?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const entry = dict[key];
  let out = entry ? entry[lang === "bn" ? 1 : 0] : key;
  if (params) for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, String(v));
  return out;
}

export function useLang(): Lang {
  const lang = useUI((s) => s.lang);
  const hydrated = useHydrated();
  return hydrated ? lang : "en";
}

export function useT(): { t: TFn; lang: Lang; n: (v: string | number) => string } {
  const lang = useLang();
  const digits = useUI((s) => s.bnDigits);
  const hydrated = useHydrated();
  const useBn = hydrated && lang === "bn" && digits;
  return {
    lang,
    t: (key, params) => {
      const s = translate(lang, key, params);
      return useBn ? toBnDigits(s) : s;
    },
    n: (v) => (useBn ? toBnDigits(v) : String(v)),
  };
}
