// Seeds a demo exam cycle into a LIVE API for UI testing. Usage: API=http://127.0.0.1:18090/api/v1 node scripts/seed-live-demo.mjs
const API = process.env.API ?? "http://127.0.0.1:18090/api/v1", PW = process.env.DEMO_PW ?? "Demo@Pass2026";
const api = async (m, p, t, b) => {
  const r = await fetch(API + p, { method: m, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${m} ${p} -> ${r.status} ${JSON.stringify(j)}`);
  return j.data;
};
const login = async (u) => (await api("POST", "/auth/login", null, { identifier: u, password: PW, deviceId: crypto.randomUUID(), platform: "desktop" })).accessToken;
const [hm, reg, rahim] = await Promise.all(["headmaster", "registrar", "teacher.rahim"].map(login));
const classes = await api("GET", "/classes?limit=100", reg), subjects = await api("GET", "/subjects?limit=100", reg);
const c6 = classes.find((c) => c.name === "Class 6").id, math = subjects.find((s) => s.code === "MATH").id;
const ex = await api("POST", "/exams", reg, { name: "Half Yearly Exam 2026", type: "MID_TERM", startDate: "2026-06-15", endDate: "2026-06-25" });
await api("POST", "/exam-papers", reg, { examId: ex.id, classId: c6, subjectId: math });
await api("POST", `/exams/${ex.id}/authorize`, hm);
const subs = (await api("GET", `/mark-submissions?limit=100&examId=${ex.id}`, rahim));
console.log("exam", ex.id, "submissions", subs.map((s) => `${s.sectionName}:${s.status}`).join(" "));
