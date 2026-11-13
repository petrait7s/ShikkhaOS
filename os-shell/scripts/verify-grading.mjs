// Standalone self-check mirroring src/lib/grading.ts rules.
const scale = [
  [80, "A+", 5], [70, "A", 4], [60, "A-", 3.5], [50, "B", 3], [40, "C", 2], [33, "D", 1], [0, "F", 0],
];
const pass = 33;
function sub(mark, full = 100) {
  if (mark === null || mark === "AB") return { grade: "F", point: 0, passed: false };
  const pct = (mark / full) * 100;
  if (pct < pass) return { grade: "F", point: 0, passed: false };
  const b = scale.find((s) => pct >= s[0]);
  return { grade: b[1], point: b[2], passed: true };
}
function overall(list) {
  if (list.some((l) => !l.passed)) return { gpa: 0, grade: "Failed" };
  return { gpa: Math.round((list.reduce((s, l) => s + l.point, 0) / list.length) * 100) / 100 };
}
const cases = [
  ["80 -> A+", sub(80).grade === "A+"],
  ["79 -> A", sub(79).grade === "A"],
  ["60 -> A- 3.5", sub(60).grade === "A-" && sub(60).point === 3.5],
  ["33 -> D 1.0", sub(33).grade === "D" && sub(33).point === 1],
  ["32 -> F", sub(32).grade === "F"],
  ["AB -> F", sub("AB").grade === "F"],
  ["half full marks 50/50 -> A+", sub(50, 50).grade === "A+"],
  ["mean GPA 5,4,3 = 4.00", overall([sub(85), sub(75), sub(55)]).gpa === 4],
  ["any fail -> GPA 0 Failed", (() => { const o = overall([sub(90), sub(20)]); return o.gpa === 0 && o.grade === "Failed"; })()],
];
let failed = 0;
for (const [name, ok] of cases) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
