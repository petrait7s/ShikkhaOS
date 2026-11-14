import type {
  Article, AuditLog, Cell, CellState, DB, DayMetric, ErrorEvent, Exam, Invite, Notice, Notification,
  Publication, School, Student, SubjectDef, Teacher, User, MarkValue,
} from "@/api/contracts";
import { DEFAULT_GRADING } from "@/lib/grading";
import { DESIGNATIONS, FEMALE, GUARDIANS, MALE, SUBJECT_MASTER, TEACHER_NAMES, subjectsForClass } from "./names";

export const DB_VERSION = 2;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T,>(r: Rng, a: T[]): T => a[Math.floor(r() * a.length)] as T;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;

type SchoolSpec = { school: School; prefix: string; perSection: number; teachers: number; full: boolean };

const SCHOOLS: SchoolSpec[] = [
  {
    prefix: "GC", perSection: 30, teachers: 28, full: true,
    school: { id: "sch_gcms", name: "Green Crescent Model School", nameBn: "গ্রিন ক্রিসেন্ট মডেল স্কুল", city: "Sylhet", monogram: "GC", primary: "#0F172A", joinCode: "GCMS-4821", status: "active", autoApprove: false, seasonOverride: null },
  },
  {
    prefix: "SV", perSection: 8, teachers: 8, full: false,
    school: { id: "sch_surma", name: "Surma Valley High School", nameBn: "সুরমা ভ্যালি উচ্চ বিদ্যালয়", city: "Sylhet", monogram: "SV", primary: "#2b5fa8", joinCode: "SVHS-7340", status: "active", autoApprove: true, seasonOverride: null },
  },
  {
    prefix: "SI", perSection: 6, teachers: 6, full: false,
    school: { id: "sch_shapla", name: "Shapla Ideal Academy", nameBn: "শাপলা আইডিয়াল একাডেমি", city: "Dhaka", monogram: "SI", primary: "#a8456b", joinCode: "SIA-5512", status: "trial", autoApprove: false, seasonOverride: null },
  },
];

export const PETRA_SCHOOL_ID = "platform";
export const RICH_STUDENT_ID = "GC26-08A-07";
export const MAIN_SCHOOL_ID = "sch_gcms";

function sectionsFor(classNo: number): string[] {
  return classNo >= 6 ? ["A", "B"] : ["A"];
}

function markFor(r: Rng, ability: number, bias: number): number {
  const base = ability + bias + (r() - 0.5) * 22;
  return Math.max(8, Math.min(99, Math.round(base)));
}

export function buildSeed(): DB {
  const NOW = Date.now();
  const r = mulberry32(20260101);
  const db: DB = {
    version: DB_VERSION, schools: [], users: [], students: [], teachers: [], invites: [], subjects: [], exams: [],
    cells: [], publications: [], notices: [], notifications: [], issues: [], articles: [], audit: [],
    grading: {}, errors: [], metrics: [], rejections: [], routine: [], examSlots: [],
  };

  for (const spec of SCHOOLS) seedSchool(db, spec, r, NOW);
  seedContent(db, r, NOW);
  seedPlatform(db, r, NOW);
  db.users.push({ id: "usr_petra", schoolId: PETRA_SCHOOL_ID, role: "petra", loginId: "admin@petra.dev", password: "petra123", name: "Petra Admin", refId: null, status: "active", mustReset: false });
  return db;
}

const ROUTINE_PERIODS = 6;

function seedRoutine(db: DB, sid: string, teachers: Teacher[], examId: string): void {
  const busy = new Set<string>();
  let shift = 0;
  for (let c = 1; c <= 10; c++) {
    for (const sec of sectionsFor(c)) {
      const subs = subjectsForClass(c);
      const teacherOf = new Map<string, string | null>();
      for (const sub of subs) {
        const t = teachers.find((x) => x.assignments.some((a) => a.classNo === c && a.section === sec && a.subject === sub));
        teacherOf.set(sub, t ? t.id : null);
      }
      shift++;
      for (let day = 0; day < 5; day++) {
        const usedToday = new Set<string>();
        for (let period = 1; period <= ROUTINE_PERIODS; period++) {
          const base = day * 2 + period + shift;
          let chosen: string | null = null;
          for (let k = 0; k < subs.length; k++) {
            const sub = subs[(base + k) % subs.length] as string;
            const tid = teacherOf.get(sub) ?? null;
            if (usedToday.has(sub)) continue;
            if (tid && busy.has(`${tid}|${day}|${period}`)) continue;
            chosen = sub;
            break;
          }
          if (!chosen) continue;
          const tid = teacherOf.get(chosen) ?? null;
          if (tid) busy.add(`${tid}|${day}|${period}`);
          usedToday.add(chosen);
          db.routine.push({ schoolId: sid, classNo: c, section: sec, day, period, subject: chosen, teacherId: tid });
        }
      }
    }
    // Annual exam routine: one subject per working day from 1 Dec 2026 (Sun-Thu)
    const subs = subjectsForClass(c);
    const d = new Date(Date.UTC(2026, 11, 1));
    subs.forEach((sub, i) => {
      while (d.getUTCDay() === 5 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
      db.examSlots.push({
        id: `${sid}_es_${c}_${i}`, schoolId: sid, examId, classNo: c, subject: sub,
        date: d.toISOString().slice(0, 10), start: "10:00", end: "13:00", room: `Room ${c}${i % 2 === 0 ? "01" : "02"}`,
      });
      d.setUTCDate(d.getUTCDate() + 1);
    });
  }
}

function seedSchool(db: DB, spec: SchoolSpec, r: Rng, NOW: number): void {
  const { school, prefix } = spec;
  const sid = school.id;
  db.schools.push(school);
  db.grading[sid] = DEFAULT_GRADING;

  const half: Exam = { id: `${sid}_hy`, schoolId: sid, name: "Half-Yearly", nameBn: "অর্ধবার্ষিক", kind: "term", year: 2026 };
  const annual: Exam = { id: `${sid}_an`, schoolId: sid, name: "Annual", nameBn: "বার্ষিক", kind: "term", year: 2026 };
  const ct: Exam = { id: `${sid}_ct`, schoolId: sid, name: "Class Test 1", nameBn: "ক্লাস টেস্ট ১", kind: "test", year: 2026 };
  db.exams.push(half, annual, ct);

  for (let c = 1; c <= 10; c++) {
    for (const s of subjectsForClass(c)) {
      const m = SUBJECT_MASTER.find((x) => x.en === s);
      db.subjects.push({
        schoolId: sid, classNo: c, subject: s, subjectBn: m ? m.bn : s, full: 100, pass: 33,
        components: s === "ICT" || s === "Science" || s === "Physics" || s === "Chemistry" || s === "Biology" ? ["Written", "MCQ", "Practical"] : ["Written", "MCQ"],
      } satisfies SubjectDef);
    }
  }

  // Teachers
  const teachers: Teacher[] = [];
  const specs: string[] = [];
  for (let i = 0; i < spec.teachers; i++) {
    const n = TEACHER_NAMES[i % TEACHER_NAMES.length] as [string, string];
    const spc = (SUBJECT_MASTER[i % SUBJECT_MASTER.length] as { en: string }).en;
    specs.push(spc);
    const invited = spec.full && i >= spec.teachers - 3;
    teachers.push({
      id: `${sid}_t${pad(i + 1)}`, schoolId: sid, name: n[0], nameBn: n[1],
      phone: `0171${sid === "sch_gcms" ? "1" : sid === "sch_surma" ? "2" : "3"}${pad(i + 1, 6)}`,
      email: `${n[0].toLowerCase().replace(/[^a-z]+/g, ".").replace(/\.$/, "")}@${prefix.toLowerCase()}.edu.bd`,
      designation: DESIGNATIONS[i % DESIGNATIONS.length] as string, assignments: [], status: invited ? "invited" : "active",
    });
  }
  const activeTeachers = teachers.filter((t) => t.status === "active");
  const bySubject = (sub: string, key: number): Teacher => {
    const idx = teachers.map((t, i) => ({ t, i })).filter((x) => specs[x.i] === sub && x.t.status === "active");
    if (idx.length) return (idx[key % idx.length] as { t: Teacher }).t;
    return activeTeachers[key % activeTeachers.length] as Teacher;
  };

  // Students + assignments
  const students: Student[] = [];
  let gIdx = 0;
  for (let c = 1; c <= 10; c++) {
    for (const sec of sectionsFor(c)) {
      for (let roll = 1; roll <= spec.perSection; roll++) {
        const female = r() < 0.5;
        const nm = pick(r, female ? FEMALE : MALE);
        const g = pick(r, GUARDIANS);
        gIdx++;
        students.push({
          id: `${sid}_s${pad(gIdx, 4)}`, schoolId: sid, studentId: `${prefix}26-${pad(c)}${sec}-${pad(roll)}`,
          roll, name: nm[0], nameBn: nm[1], classNo: c, section: sec, guardian: g[0],
          guardianPhone: `017${Math.floor(r() * 90_000_000 + 10_000_000)}`,
          admission: iso(Date.UTC(2026 - Math.min(c, 5), 0, 5 + Math.floor(r() * 20))),
          status: r() < 0.7 ? "active" : "unclaimed",
        });
      }
      subjectsForClass(c).forEach((sub, k) => {
        const t = bySubject(sub, c * 3 + k + (sec === "B" ? 1 : 0));
        t.assignments.push({ classNo: c, section: sec, subject: sub });
      });
    }
  }
  // rich demo student
  const rich = students.find((s) => s.studentId === `${prefix}26-08A-07`);
  if (rich) {
    rich.name = "Tahsin Rahman"; rich.nameBn = "তাহসিন রহমান"; rich.status = "active";
  }
  // pending sign-ups (main school): 5 unclaimed -> pending
  if (spec.full) {
    let n = 0;
    for (const s of students) {
      if (n >= 5) break;
      if (s.status === "unclaimed" && s.classNo >= 6) { s.status = "pending"; n++; }
    }
  }
  db.students.push(...students);
  db.teachers.push(...teachers);
  seedRoutine(db, sid, teachers, annual.id);

  // Users
  db.users.push({ id: `${sid}_reg`, schoolId: sid, role: "registrar", loginId: `registrar@${prefix.toLowerCase()}ms.edu.bd`, password: "registrar123", name: `Registrar, ${school.name}`, refId: null, status: "active", mustReset: false });
  db.users.push({ id: `${sid}_hm`, schoolId: sid, role: "headmaster", loginId: `headmaster@${prefix.toLowerCase()}ms.edu.bd`, password: "headmaster123", name: "Md. Abdul Karim, Headmaster", refId: null, status: "active", mustReset: false });
  for (const t of teachers) {
    if (t.status === "active") db.users.push({ id: `usr_${t.id}`, schoolId: sid, role: "teacher", loginId: t.phone, password: "teacher123", name: t.name, refId: t.id, status: "active", mustReset: false });
  }
  for (const s of students) {
    if (s.status === "unclaimed") continue;
    db.users.push({ id: `usr_${s.id}`, schoolId: sid, role: "student", loginId: s.studentId, password: "student123", name: s.name, refId: s.id, status: s.status === "pending" ? "pending" : "active", mustReset: false });
  }
  if (spec.full) {
    teachers.filter((t) => t.status === "invited").forEach((t, i) => {
      db.invites.push({ code: `INV-${pad(i + 1)}${(t.id.slice(-2) + "K7").toUpperCase()}`, schoolId: sid, teacherId: t.id, status: "pending", createdAt: iso(NOW - (i + 1) * DAY) } satisfies Invite);
    });
  }

  // Marks
  const ability = new Map<string, number>();
  const bias = new Map<string, number>();
  for (const s of students) {
    let a = 62 + (r() + r() + r() - 1.5) * 24;
    if (s.studentId === `${prefix}26-08A-07`) a = 76;
    ability.set(s.id, a);
  }
  const buildMarks = (list: Student[], sub: string, partial: boolean, tweak: number): Record<string, MarkValue> => {
    const out: Record<string, MarkValue> = {};
    list.forEach((s, i) => {
      if (partial && i % 5 >= 3) return;
      let b = tweak;
      if (s.studentId === `${prefix}26-08A-07`) b += sub === "Mathematics" || sub === "Science" ? 14 : sub === "Bangla" || sub === "English" ? -6 : 3;
      bias.set(s.id + sub, b);
      const v = r() < 0.006 ? "AB" : r() < 0.03 ? Math.round(10 + r() * 22) : markFor(r, ability.get(s.id) ?? 60, b);
      out[s.id] = v;
    });
    return out;
  };

  const mkCell = (exam: Exam, c: number, sec: string, sub: string, state: CellState, marks: Record<string, MarkValue>, t: Teacher | undefined, when: number): Cell => ({
    schoolId: sid, examId: exam.id, classNo: c, section: sec, subject: sub, state, marks,
    submittedBy: state === "not_started" || state === "draft" ? null : (t ? t.id : null),
    source: state === "not_started" ? "none" : state === "uploaded" ? "excel" : "teacher",
    updatedAt: state === "not_started" ? null : iso(when), returnComment: null, locked: state !== "not_started" && state !== "draft",
  });

  const tw = (c: number, sub: string) => (sub === "Mathematics" ? -3 : sub === "English" ? -2 : 1) + (c > 8 ? -2 : 0);
  const weights: CellState[] = ["not_started", "draft", "submitted", "submitted", "uploaded", "verified", "verified", "verified"];

  for (let c = 1; c <= 10; c++) {
    for (const sec of sectionsFor(c)) {
      const list = students.filter((s) => s.classNo === c && s.section === sec);
      for (const sub of subjectsForClass(c)) {
        const t = teachers.find((x) => x.assignments.some((a) => a.classNo === c && a.section === sec && a.subject === sub));
        // Half-yearly: published
        db.cells.push(mkCell(half, c, sec, sub, "published", buildMarks(list, sub, false, tw(c, sub)), t, NOW - 95 * DAY));
        // Annual: mix
        let st: CellState;
        if (!spec.full) st = "not_started";
        else if (c === 8 && sec === "A") st = "verified";
        else if (c === 7 && sec === "A") st = "verified";
        else if (c === 10 && sec === "B") st = "published";
        else st = weights[Math.floor(r() * weights.length)] as CellState;
        const marks = st === "not_started" ? {} : buildMarks(list, sub, st === "draft", tw(c, sub));
        db.cells.push(mkCell(annual, c, sec, sub, st, marks, t, NOW - Math.floor(r() * 6 + 1) * DAY / 2));
        // Class test: not started
        db.cells.push(mkCell(ct, c, sec, sub, "not_started", {}, t, NOW));
      }
      db.publications.push({ schoolId: sid, examId: half.id, classNo: c, section: sec, state: "published", at: iso(NOW - 90 * DAY) } satisfies Publication);
      if (spec.full && c === 10 && sec === "B") db.publications.push({ schoolId: sid, examId: annual.id, classNo: c, section: sec, state: "published", at: iso(NOW - 2 * DAY) });
      if (spec.full && c === 7 && sec === "A") db.publications.push({ schoolId: sid, examId: annual.id, classNo: c, section: sec, state: "scheduled", at: iso(NOW + 3 * 3600_000) });
    }
  }

  // Ensure matrix has draft + uploaded visible in main school even if rng skips
  if (spec.full) {
    const force: [number, string, string, CellState][] = [[9, "A", "Physics", "draft"], [9, "A", "Chemistry", "uploaded"], [9, "A", "Biology", "submitted"], [9, "A", "ICT", "not_started"], [9, "A", "English", "verified"]];
    for (const [c, sec, sub, st] of force) {
      const cell = db.cells.find((x) => x.examId === annual.id && x.classNo === c && x.section === sec && x.subject === sub && x.schoolId === sid);
      if (!cell) continue;
      const list = students.filter((s) => s.classNo === c && s.section === sec);
      cell.state = st;
      cell.marks = st === "not_started" ? {} : buildMarks(list, sub, st === "draft", 0);
      cell.source = st === "not_started" ? "none" : st === "uploaded" ? "excel" : "teacher";
      cell.locked = st !== "not_started" && st !== "draft";
      cell.updatedAt = st === "not_started" ? null : iso(NOW - 3600_000);
      const tt = teachers.find((x) => x.assignments.some((a) => a.classNo === c && a.section === sec && a.subject === sub));
      cell.submittedBy = st === "not_started" || st === "draft" ? null : (tt ? tt.id : null);
    }
    // keep class 8A, 7A fully verified
    for (const cell of db.cells) {
      if (cell.schoolId === sid && cell.examId === annual.id && cell.section === "A" && (cell.classNo === 8 || cell.classNo === 7)) {
        cell.state = "verified"; cell.locked = true;
        if (Object.keys(cell.marks).length === 0) {
          const list = students.filter((s) => s.classNo === cell.classNo && s.section === "A");
          cell.marks = buildMarks(list, cell.subject, false, 0);
        }
      }
    }
  }
}

function seedContent(db: DB, r: Rng, NOW: number): void {
  const sid = MAIN_SCHOOL_ID;
  const mk = (i: number, title: string, body: string, audience: Notice["audience"], classNo: number | null, pinned: boolean, daysAgo: number): Notice => ({
    id: `ntc_${pad(i)}`, schoolId: sid, title, body, audience, classNo, pinned, publishAt: iso(NOW - daysAgo * DAY), reads: Math.floor(r() * 300) + 20, author: "Registrar",
  });
  db.notices.push(
    mk(1, "Annual Examination Routine", "The Annual Examination begins on 1 December. Please collect the routine from the notice board and follow the dress code.", "all", null, true, 2),
    mk(2, "Winter Vacation", "School will remain closed from 24 December to 3 January for the winter vacation.", "all", null, false, 5),
    mk(3, "Parents' Meeting", "A parents' meeting for Classes 6 to 10 will be held this Saturday at 10:00 AM.", "all", null, false, 7),
    mk(4, "Class 8 Science Fair", "Class 8 students should submit their science project titles to their class teacher by next Thursday.", "class", 8, false, 3),
    mk(5, "Marks Submission Deadline", "All teachers must submit Annual marks by Wednesday. Late submissions delay result publication.", "teachers", null, true, 1),
    mk(6, "Library Hours Extended", "The library stays open until 4:30 PM during exam week.", "all", null, false, 9),
    mk(7, "Class 10 Model Test", "Class 10 model test starts Sunday. Admit cards are available from the office.", "class", 10, false, 4),
    mk(8, "Staff Training Workshop", "A workshop on continuous assessment is scheduled for the teachers on Friday afternoon.", "teachers", null, false, 6),
    mk(9, "Sports Day Registration", "Register for Sports Day events with your house captain before the end of the week.", "all", null, false, 12),
    mk(10, "Class 6 Orientation", "Orientation for new Class 6 students is held in the main hall at 9:00 AM.", "class", 6, false, 14),
    mk(11, "Uniform Reminder", "Students must wear the full school uniform from Sunday.", "all", null, false, 15),
    mk(12, "Result Day Announcement", "Class 8 and Class 7 Annual results will be published once verification is complete.", "all", null, true, 0),
  );
  const nt = (i: number, role: Notification["role"], text: string, h: number): Notification => ({ id: `nf_${i}`, schoolId: sid, userId: null, role, text, at: iso(NOW - h * 3600_000), read: false });
  db.notifications.push(
    nt(1, "registrar", "5 sign-up requests are waiting for approval.", 2),
    nt(2, "registrar", "Class 8 Annual is fully verified and ready to publish.", 5),
    nt(3, "teacher", "Annual marks deadline is Wednesday.", 8),
    nt(4, "student", "Half-Yearly results are available in My Results.", 72),
    nt(5, "registrar", "3 teacher invites are still pending.", 26),
  );
  db.issues.push(
    { id: "iss_1", schoolId: sid, title: "Shapla — Spring Issue", titleBn: "শাপলা — বসন্ত সংখ্যা", hue: 150, status: "published", publishedAt: iso(NOW - 60 * DAY) },
    { id: "iss_2", schoolId: sid, title: "Monsoon Voices", titleBn: "বর্ষার কথা", hue: 215, status: "published", publishedAt: iso(NOW - 20 * DAY) },
  );
  const art = (i: number, issueId: string | null, title: string, lang: Article["lang"], author: string, body: string, status: Article["status"]): Article => ({ id: `art_${i}`, schoolId: sid, issueId, title, lang, author, body, status });
  db.articles.push(
    art(1, "iss_1", "The Sound of Rain on a Tin Roof", "en", "Nusrat Jahan, Class 9", "Every monsoon the tin roof of our old house in Sylhet turns into a drum.\n\nI used to hate it. Now I **listen** for it. It tells me the hills are green and the haors are filling.\n\n- Smell of wet earth\n- Kacha aam with salt\n- Paper boats in the yard", "published"),
    art(2, "iss_1", "আমার গ্রামের নদী", "bn", "রাফিউল ইসলাম, নবম শ্রেণি", "আমার গ্রামের পাশ দিয়ে বয়ে গেছে সুরমা নদী।\n\nভোরবেলা কুয়াশা ভেদ করে মাঝিরা নৌকা ভাসায়। **নদীই** আমাদের গ্রামের প্রাণ।", "published"),
    art(3, "iss_2", "Why I Love Mathematics", "en", "Tahsin Rahman, Class 8", "Mathematics is a language for patterns.\n\nWhen a hard problem finally opens up, it feels like a locked door swinging open.", "published"),
    art(4, "iss_2", "বিজ্ঞান মেলার দিন", "bn", "তানজিলা হোসেন, অষ্টম শ্রেণি", "বিজ্ঞান মেলায় আমরা সৌরশক্তিচালিত একটি ছোট গাড়ি বানিয়েছিলাম।\n\n**দলগত কাজ** আমাদের অনেক কিছু শিখিয়েছে।", "published"),
    art(5, null, "My First Football Match", "en", "Anik Das, Class 7", "I was nervous before the match, but my teammates cheered me on.", "pending"),
    art(6, null, "শীতের সকাল", "bn", "সাদিয়া আফরিন, দশম শ্রেণি", "শীতের সকালে খেজুরের রসের গন্ধে ঘুম ভাঙে।", "pending"),
    art(7, null, "Teaching Kindness", "en", "Shahida Parvin, Faculty", "Kindness is the first lesson of every classroom.", "pending"),
  );
  const acts: [string, string, string, string][] = [
    ["registrar", "student.approve", "Student", "Approved sign-up request"], ["registrar", "exam.verify", "Marks", "Verified Class 8-A Mathematics"],
    ["teacher", "marks.submit", "Marks", "Submitted Class 9-A English"], ["registrar", "notice.create", "Notice", "Posted Annual Examination Routine"],
    ["registrar", "teacher.invite", "Teacher", "Generated teacher invite"], ["registrar", "marks.upload", "Marks", "Uploaded Excel for Class 7-A Science"],
    ["teacher", "marks.draft", "Marks", "Saved draft Class 9-A Physics"], ["registrar", "settings.update", "School", "Updated school profile"],
  ];
  for (let i = 0; i < 26; i++) {
    const a = acts[i % acts.length] as [string, string, string, string];
    db.audit.push({ id: `aud_${i}`, schoolId: sid, actor: a[0] === "teacher" ? "Shahida Parvin" : "Registrar", role: a[0] === "teacher" ? "teacher" : "registrar", action: a[1], entity: a[2], summary: a[3], at: iso(NOW - (i * 7 + 1) * 3600_000) } satisfies AuditLog);
  }
}

function seedPlatform(db: DB, r: Rng, NOW: number): void {
  for (let i = 29; i >= 0; i--) {
    const d = new Date(NOW - i * DAY).toISOString().slice(0, 10);
    db.metrics.push({ day: d, uptime: 99.2 + r() * 0.8, errorRate: 0.1 + r() * 0.9, latency: 90 + Math.floor(r() * 110), dau: 180 + Math.floor(r() * 200), published: Math.floor(r() * 5), uploads: Math.floor(r() * 24) } satisfies DayMetric);
  }
  const ev: [string, ErrorEvent["severity"], number, string][] = [
    ["Excel parse failure: unsupported sheet layout", "warn", 14, "sch_gcms"], ["Session refresh timeout", "info", 41, "sch_surma"],
    ["Result publish retry exceeded", "error", 3, "sch_gcms"], ["PNG share render failed on iOS Safari", "warn", 9, "sch_shapla"],
    ["Database connection pool exhausted", "critical", 1, "sch_gcms"], ["Notification delivery delayed", "info", 22, "sch_surma"],
    ["Roster import duplicate student IDs", "warn", 6, "sch_shapla"], ["Unhandled promise rejection in marks grid", "error", 4, "sch_surma"],
  ];
  ev.forEach(([g, s, c, sc], i) => db.errors.push({ id: `err_${i}`, schoolId: sc, group: g, severity: s, count: c, lastSeen: iso(NOW - (i + 1) * 5 * 3600_000) }));
}

export const DEMO_ACCOUNTS = [
  { role: "headmaster" as const, id: "headmaster@gcms.edu.bd", password: "headmaster123" },
  { role: "registrar" as const, id: "registrar@gcms.edu.bd", password: "registrar123" },
  { role: "teacher" as const, id: "01711000005", password: "teacher123" },
  { role: "student" as const, id: RICH_STUDENT_ID, password: "student123" },
];

export type { User };
