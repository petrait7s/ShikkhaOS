import type { MarkValue, Student, SubjectDef } from "@/api/contracts";
import type { RosterRow, TeacherRow } from "@/api/repositories";
import { norm, type Grid, type SheetSpec } from "@/lib/excel";

export type Severity = "error" | "warn";
export type Issue = { row: number; roll: string; name: string; column: string; severity: Severity; message: string };

export type Layout = {
  sheet: string;
  headerRow: number;
  rollCol: number;
  nameCol: number;
  format: "A" | "B";
  comps: { label: string; col: number }[];
  totalCol: number;
  subjectCols: { subject: string; col: number }[];
  headers: string[];
};

export type Hints = { classNo: number | null; section: string | null; subject: string | null };

export type PreviewRow = { row: number; roll: string; name: string; cells: string[]; status: "ok" | "warn" | "error"; messages: string[] };

export type Validation = {
  issues: Issue[];
  rows: PreviewRow[];
  columns: string[];
  values: Record<string, Record<string, MarkValue>>;
  counts: { ok: number; warn: number; error: number; absent: number; missing: number };
};

const ROLL = /^(roll|roll no|roll number|রোল)/i;
const NAME = /^(name|student name|নাম)/i;
const TOTAL = /^(total|মোট)/i;

export function detectLayout(sheets: { sheet: string; grid: Grid }[], subjectNames: { en: string; bn: string }[]): Layout | null {
  for (const s of sheets) {
    const limit = Math.min(s.grid.length, 12);
    for (let r = 0; r < limit; r++) {
      const row = s.grid[r] ?? [];
      const rollCol = row.findIndex((c) => ROLL.test(c.trim()));
      if (rollCol < 0) continue;
      const nameCol = row.findIndex((c) => NAME.test(c.trim()));
      const subjectCols: { subject: string; col: number }[] = [];
      row.forEach((c, i) => {
        const n = norm(c);
        const hit = subjectNames.find((x) => norm(x.en) === n || norm(x.bn) === n);
        if (hit) subjectCols.push({ subject: hit.en, col: i });
      });
      const totalCol = row.findIndex((c) => TOTAL.test(c.trim()));
      const comps = row.map((c, i) => ({ label: c.trim(), col: i })).filter((x) => x.col !== rollCol && x.col !== nameCol && x.col !== totalCol && x.label !== "" && !subjectCols.some((sc) => sc.col === x.col));
      return {
        sheet: s.sheet, headerRow: r, rollCol, nameCol, format: subjectCols.length > 0 ? "B" : "A",
        comps: subjectCols.length > 0 ? [] : comps, totalCol, subjectCols, headers: row.map((c) => c.trim()),
      };
    }
  }
  return null;
}

export function detectHints(filename: string, sheet: string, pre: string[], subjects: string[]): Hints {
  const text = `${filename.replace(/\.[a-z0-9]+$/i, "")} ${sheet} ${pre.join(" ")}`;
  let classNo: number | null = null;
  let section: string | null = null;
  const m1 = /class\s*[-_:]?\s*(\d{1,2})\s*[-_ ]?\s*([A-Da-d])?\b/i.exec(text);
  if (m1) {
    classNo = Number(m1[1]);
    if (m1[2]) section = m1[2].toUpperCase();
  } else {
    const m2 = /(?:^|[^0-9a-z])(\d{1,2})\s*[-_ ]?\s*([AB])(?![a-z])/i.exec(text);
    if (m2) { classNo = Number(m2[1]); section = (m2[2] as string).toUpperCase(); }
  }
  if (section === null) {
    const m3 = /section\s*[-_:]?\s*([A-Da-d])\b/i.exec(text);
    if (m3) section = (m3[1] as string).toUpperCase();
  }
  const low = text.toLowerCase();
  const subject = [...subjects].sort((a, b) => b.length - a.length).find((s) => low.includes(s.toLowerCase())) ?? null;
  return { classNo: classNo && classNo >= 1 && classNo <= 12 ? classNo : null, section, subject };
}

function parseMark(raw: string, full: number): { value: MarkValue; err?: string; absent?: boolean } {
  const s = raw.trim();
  if (!s) return { value: null, err: "Empty cell" };
  if (/^(ab|absent)$/i.test(s)) return { value: "AB", absent: true };
  const n = Number(s);
  if (Number.isNaN(n)) return { value: null, err: `"${s}" is not a number` };
  if (n < 0) return { value: null, err: "Negative marks" };
  if (n > full) return { value: null, err: `Marks ${n} are above full marks ${full}` };
  return { value: n };
}

export function validateMarks(layout: Layout, grid: Grid, ctx: { students: Student[]; defs: SubjectDef[]; hints: Hints }): Validation {
  const issues: Issue[] = [];
  const rows: PreviewRow[] = [];
  const values: Record<string, Record<string, MarkValue>> = {};
  const counts = { ok: 0, warn: 0, error: 0, absent: 0, missing: 0 };
  const byRoll = new Map(ctx.students.map((s) => [s.roll, s]));
  const body = grid.slice(layout.headerRow + 1).map((cells, i) => ({ cells, row: layout.headerRow + 2 + i })).filter((x) => x.cells.some((c) => c.trim() !== ""));
  const rollCount = new Map<string, number>();
  for (const b of body) { const k = (b.cells[layout.rollCol] ?? "").trim(); rollCount.set(k, (rollCount.get(k) ?? 0) + 1); }

  const cols: { label: string; col: number; subject: string | null }[] =
    layout.format === "B"
      ? layout.subjectCols.map((c) => ({ label: layout.headers[c.col] ?? c.subject, col: c.col, subject: c.subject }))
      : [...layout.comps.map((c) => ({ label: c.label, col: c.col, subject: null })), ...(layout.totalCol >= 0 ? [{ label: layout.headers[layout.totalCol] ?? "Total", col: layout.totalCol, subject: null }] : [])];
  const defOf = (s: string | null) => ctx.defs.find((d) => d.subject === s);
  const seen = new Set<string>();

  for (const b of body) {
    const rollStr = (b.cells[layout.rollCol] ?? "").trim();
    const name = layout.nameCol >= 0 ? (b.cells[layout.nameCol] ?? "").trim() : "";
    const msgs: string[] = [];
    let status = "ok" as "ok" | "warn" | "error";
    const push = (sev: Severity, column: string, message: string) => {
      issues.push({ row: b.row, roll: rollStr, name, column, severity: sev, message });
      msgs.push(message);
      if (sev === "error") status = "error"; else if (status === "ok") status = "warn";
    };
    const st = byRoll.get(Number(rollStr));
    if (!rollStr || Number.isNaN(Number(rollStr))) push("error", "Roll", "Roll is missing or not a number");
    else if (!st) push("error", "Roll", `Unknown roll ${rollStr} for this class`);
    else if ((rollCount.get(rollStr) ?? 0) > 1) push("error", "Roll", `Duplicate roll ${rollStr}`);
    else {
      if (name && norm(name) !== norm(st.name) && norm(name) !== norm(st.nameBn)) push("warn", "Name", `Name differs from roster (${st.name})`);
      seen.add(st.id);
    }
    const usable = !!st && (rollCount.get(rollStr) ?? 0) === 1;

    if (layout.format === "B") {
      for (const c of layout.subjectCols) {
        const d = defOf(c.subject);
        if (!d) { push("error", c.subject, `${c.subject} is not taught in this class`); continue; }
        const p = parseMark(b.cells[c.col] ?? "", d.full);
        if (p.err) push("error", d.subject, p.err);
        else if (usable && st) {
          (values[d.subject] ??= {})[st.id] = p.value;
          if (p.absent) counts.absent++;
        }
      }
    } else {
      const d = defOf(ctx.hints.subject);
      if (!d) push("error", "Subject", "Subject is not selected");
      else {
        const compVals = layout.comps.map((c) => (b.cells[c.col] ?? "").trim());
        const totalRaw = layout.totalCol >= 0 ? (b.cells[layout.totalCol] ?? "").trim() : "";
        let value: MarkValue = null;
        let err: string | undefined;
        let absent = false;
        if (totalRaw !== "") {
          const p = parseMark(totalRaw, d.full);
          value = p.value; err = p.err; absent = !!p.absent;
          const nums = compVals.filter((v) => v !== "" && !Number.isNaN(Number(v))).map(Number);
          if (!err && !absent && nums.length === compVals.filter((v) => v !== "").length && nums.length > 0 && nums.reduce((a, c) => a + c, 0) !== value) push("warn", "Total", "Total differs from the sum of components. Total column is used.");
        } else if (compVals.some((v) => v !== "")) {
          if (compVals.some((v) => /^(ab|absent)$/i.test(v))) { value = "AB"; absent = true; }
          else {
            const bad = compVals.find((v) => v !== "" && Number.isNaN(Number(v)));
            if (bad !== undefined) err = `"${bad}" is not a number`;
            else if (compVals.some((v) => Number(v) < 0)) err = "Negative marks";
            else { const sum = compVals.reduce((a, v) => a + (v === "" ? 0 : Number(v)), 0); const p = parseMark(String(sum), d.full); value = p.value; err = p.err; }
          }
        } else err = "Empty cell";
        if (err) push("error", "Total", err);
        else if (usable && st) { (values[d.subject] ??= {})[st.id] = value; if (absent) counts.absent++; }
      }
    }
    rows.push({ row: b.row, roll: rollStr, name, cells: cols.map((c) => (b.cells[c.col] ?? "").trim()), status, messages: msgs });
    counts[status]++;
  }
  counts.missing = ctx.students.filter((s) => !seen.has(s.id)).length;
  return { issues, rows, columns: cols.map((c) => c.label), values, counts };
}

export function errorReport(v: Validation): SheetSpec[] {
  return [{
    name: "Issues",
    rows: [["Row", "Roll", "Name", "Column", "Severity", "Message"], ...v.issues.map((i) => [i.row, i.roll, i.name, i.column, i.severity, i.message])],
    widths: [8, 8, 24, 16, 10, 56],
  }];
}

export function subjectTemplate(students: Student[], def: SubjectDef): SheetSpec {
  return { name: `Class ${students[0]?.classNo ?? ""}-${students[0]?.section ?? ""} ${def.subject}`.slice(0, 31), rows: [["Roll", "Name", ...def.components, "Total"], ...students.map((s) => [s.roll, s.name])], widths: [8, 28, 12, 12, 12, 12] };
}

export function classTemplate(students: Student[], defs: SubjectDef[]): SheetSpec {
  return { name: `Class ${students[0]?.classNo ?? ""}-${students[0]?.section ?? ""}`, rows: [["Roll", "Name", ...defs.map((d) => d.subject)], ...students.map((s) => [s.roll, s.name])], widths: [8, 28, ...defs.map(() => 14)] };
}

/* ---------- roster / teacher imports ---------- */

export type RosterValidation<T> = { rows: { row: number; data: T | null; messages: string[]; status: "ok" | "warn" | "error" }[]; ok: T[]; issues: Issue[] };

function headerIndex(grid: Grid, labels: string[]): { row: number; idx: number[] } | null {
  for (let r = 0; r < Math.min(grid.length, 8); r++) {
    const row = (grid[r] ?? []).map((c) => norm(c));
    const idx = labels.map((l) => row.findIndex((c) => c === norm(l)));
    if (idx.filter((i) => i >= 0).length >= Math.min(3, labels.length)) return { row: r, idx };
  }
  return null;
}

export const ROSTER_HEADERS = ["Student ID", "Roll", "Name", "Class", "Section", "Guardian", "Guardian Phone"];
export const TEACHER_HEADERS = ["Name", "Phone", "Email", "Designation"];

export function validateRoster(grid: Grid, existingIds: Set<string>): RosterValidation<RosterRow> | null {
  const h = headerIndex(grid, ROSTER_HEADERS);
  if (!h) return null;
  const out: RosterValidation<RosterRow> = { rows: [], ok: [], issues: [] };
  const seen = new Set<string>();
  grid.slice(h.row + 1).forEach((cells, i) => {
    if (!cells.some((c) => c.trim())) return;
    const g = (k: number) => (h.idx[k] !== undefined && (h.idx[k] as number) >= 0 ? (cells[h.idx[k] as number] ?? "").trim() : "");
    const row = h.row + 2 + i;
    const msgs: string[] = [];
    let status = "ok" as "ok" | "warn" | "error";
    const bad = (m: string) => { msgs.push(m); status = "error"; out.issues.push({ row, roll: g(1), name: g(2), column: "", severity: "error", message: m }); };
    const sid = g(0);
    if (!sid) bad("Student ID is missing");
    if (sid && seen.has(sid.toLowerCase())) bad(`Duplicate Student ID ${sid} in file`);
    const roll = Number(g(1)), cls = Number(g(3));
    if (!g(1) || Number.isNaN(roll) || roll < 1) bad("Roll must be a positive number");
    if (!g(2)) bad("Name is missing");
    if (!g(3) || Number.isNaN(cls) || cls < 1 || cls > 12) bad("Class must be between 1 and 12");
    if (!/^[A-Da-d]$/.test(g(4))) bad("Section must be a single letter (A-D)");
    if (!/^\d{11}$/.test(g(6).replace(/\D/g, ""))) bad("Guardian phone must have 11 digits");
    if (!g(5)) bad("Guardian name is missing");
    if (status === "ok" && existingIds.has(sid.toLowerCase())) { status = "warn"; msgs.push("Existing student. Details will be updated."); }
    seen.add(sid.toLowerCase());
    const data: RosterRow | null = status === "error" ? null : { studentId: sid, roll, name: g(2), classNo: cls, section: g(4).toUpperCase(), guardian: g(5), guardianPhone: g(6).replace(/\D/g, "") };
    out.rows.push({ row, data, messages: msgs, status });
    if (data) out.ok.push(data);
  });
  return out;
}

export function validateTeachers(grid: Grid, existingPhones: Set<string>): RosterValidation<TeacherRow> | null {
  const h = headerIndex(grid, TEACHER_HEADERS);
  if (!h) return null;
  const out: RosterValidation<TeacherRow> = { rows: [], ok: [], issues: [] };
  const seen = new Set<string>();
  grid.slice(h.row + 1).forEach((cells, i) => {
    if (!cells.some((c) => c.trim())) return;
    const g = (k: number) => (h.idx[k] !== undefined && (h.idx[k] as number) >= 0 ? (cells[h.idx[k] as number] ?? "").trim() : "");
    const row = h.row + 2 + i;
    const msgs: string[] = [];
    let status = "ok" as "ok" | "warn" | "error";
    const bad = (m: string) => { msgs.push(m); status = "error"; out.issues.push({ row, roll: "", name: g(0), column: "", severity: "error", message: m }); };
    const phone = g(1).replace(/\D/g, "");
    if (!g(0)) bad("Name is missing");
    if (!/^\d{11}$/.test(phone)) bad("Phone must have 11 digits");
    if (g(2) && !/^\S+@\S+\.\S+$/.test(g(2))) bad("Email is not valid");
    if (phone && (seen.has(phone))) bad("Duplicate phone in file");
    if (status === "ok" && existingPhones.has(phone)) { status = "warn"; msgs.push("Teacher already exists and will be skipped."); }
    seen.add(phone);
    const data: TeacherRow | null = status === "error" ? null : { name: g(0), phone, email: g(2), designation: g(3) || "Assistant Teacher" };
    out.rows.push({ row, data, messages: msgs, status });
    if (data && status === "ok") out.ok.push(data);
  });
  return out;
}
