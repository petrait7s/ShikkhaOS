// Generates demo Excel files in public/samples. Run: pnpm samples
// Names mirror src/data/seed.ts (same seeded sequence) so validation stays clean for the "valid" files.
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "samples");
mkdirSync(out, { recursive: true });

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const namesSrc = readFileSync(join(root, "src/data/names.ts"), "utf8");
function list(name) {
  const m = new RegExp(`export const ${name}: NamePair\\[\\] = (\\[[\\s\\S]*?\\n\\]);`).exec(namesSrc);
  if (!m) throw new Error(`Cannot find ${name} in names.ts`);
  return new Function(`return ${m[1]}`)();
}
const MALE = list("MALE"), FEMALE = list("FEMALE"), GUARDIANS = list("GUARDIANS");

// Replay the seed's student generation for the main school (same rng call order).
const r = mulberry32(20260101);
const pick = (a) => a[Math.floor(r() * a.length)];
const students = [];
for (let c = 1; c <= 10; c++) {
  for (const sec of c >= 6 ? ["A", "B"] : ["A"]) {
    for (let roll = 1; roll <= 30; roll++) {
      const female = r() < 0.5;
      const nm = pick(female ? FEMALE : MALE);
      pick(GUARDIANS); r(); r(); r();
      students.push({ classNo: c, section: sec, roll, name: nm[0] });
    }
  }
}
const rich = students.find((s) => s.classNo === 8 && s.section === "A" && s.roll === 7);
if (rich) rich.name = "Tahsin Rahman";

const cls = students.filter((s) => s.classNo === 9 && s.section === "A");
const rnd = mulberry32(777);
const mark = () => Math.round(48 + rnd() * 46);

async function save(name, sheetName, rows, widths) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  rows.forEach((row) => ws.addRow(row));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1E7CE" } };
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  await wb.xlsx.writeFile(join(out, name));
  console.log("wrote", name);
}

// 1. valid per-subject (Format A)
const physics = cls.map((s) => { const w = Math.round(mark() * 0.55), m = Math.round(mark() * 0.2), p = Math.round(mark() * 0.25); return [s.roll, s.name, w, m, p, w + m + p]; });
await save("Annual_Class9A_Physics.xlsx", "Class 9-A Physics", [["Roll", "Name", "Written", "MCQ", "Practical", "Total"], ...physics], [8, 28, 10, 10, 10, 10]);

// 2. valid per-class (Format B)
const subjects = ["Bangla", "English", "Mathematics", "Physics", "Chemistry", "Biology", "ICT"];
await save("Annual_Class9A_AllSubjects.xlsx", "Class 9-A", [["Roll", "Name", ...subjects], ...cls.map((s) => [s.roll, s.name, ...subjects.map(() => mark())])], [8, 28, ...subjects.map(() => 13)]);

// 3. deliberate errors (Format A, Mathematics)
const bad = cls.map((s) => [s.roll, s.name, Math.round(mark() * 0.7), Math.round(mark() * 0.3), null]);
bad.forEach((row) => { row[4] = row[2] + row[3]; });
bad[11][1] = "Wrong Name Here";            // name mismatch (warning)
bad[3][2] = "abc";                         // non-numeric
bad[7][4] = 105;                           // above full marks
bad[9][4] = -3;                            // negative
bad[14][2] = ""; bad[14][3] = ""; bad[14][4] = ""; // empty
bad[18][4] = "AB";                         // absent code
bad.push([99, "Unknown Student", 40, 20, 60]); // unknown roll
bad.push([5, bad[4][1], 41, 20, 61]);          // duplicate roll 5
await save("Annual_Class9A_Mathematics_errors.xlsx", "Class 9-A Mathematics", [["Roll", "Name", "Written", "MCQ", "Total"], ...bad], [8, 28, 10, 10, 10]);

// 4. student roster
await save("student-roster.xlsx", "Roster", [
  ["Student ID", "Roll", "Name", "Class", "Section", "Guardian", "Guardian Phone"],
  ["GC26-06A-31", 31, "Ayaan Chowdhury", 6, "A", "Mahbub Chowdhury", "01712340001"],
  ["GC26-06A-32", 32, "Mahdiya Sultana", 6, "A", "Rashed Sultan", "01712340002"],
  ["GC26-06A-33", 33, "Ishrak Hossain", 6, "A", "Sabbir Hossain", "01712340003"],
  ["GC26-06A-34", 34, "Zara Rahman", 6, "A", "Habib Rahman", "01712340004"],
  ["GC26-06A-35", 35, "Nahid Alam", 6, "A", "Tarek Alam", "01712340005"],
  ["GC26-06A-36", 36, "Bad Phone Row", 6, "A", "Some Guardian", "12345"],
], [16, 8, 24, 8, 10, 22, 16]);

// 5. teacher list
await save("teacher-list.xlsx", "Teachers", [
  ["Name", "Phone", "Email", "Designation"],
  ["Rubina Khanom", "01811000001", "rubina.khanom@gc.edu.bd", "Assistant Teacher"],
  ["Sajid Mahmud", "01811000002", "sajid.mahmud@gc.edu.bd", "Senior Teacher"],
  ["Tania Nasrin", "01811000003", "tania.nasrin@gc.edu.bd", "Assistant Teacher"],
  ["Oli Ahmed", "01811000004", "oli.ahmed@gc.edu.bd", "Head of Department"],
  ["Broken Email", "01811000005", "not-an-email", "Assistant Teacher"],
], [24, 16, 30, 22]);
