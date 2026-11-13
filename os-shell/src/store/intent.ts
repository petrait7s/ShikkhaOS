"use client";
import { create } from "zustand";

export type Intent =
  | { kind: "publish"; classNo: number }
  | { kind: "search"; app: string; q: string }
  | { kind: "cell"; classNo: number; section: string; subject: string }
  | { kind: "marks"; classNo: number; section: string; subject: string }
  | { kind: "notice"; id: string }
  | null;

type S = { intent: Intent; set: (i: Intent) => void; clear: () => void };

export const useIntent = create<S>((set) => ({ intent: null, set: (intent) => set({ intent }), clear: () => set({ intent: null }) }));
