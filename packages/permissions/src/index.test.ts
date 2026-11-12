import test from "node:test";
import assert from "node:assert/strict";
import { can, navFor } from "./index.ts";

test("navigation is permission driven", () => {
  const teacher = { role: "TEACHER" as const, permissions: ["students.read", "marks.enter", "marks.submit", "attendance.mark", "classtests.manage", "messages.read", "notices.read", "homework.manage"] };
  const ids = navFor(teacher).map((n) => n.id);
  assert.ok(ids.includes("marks") && ids.includes("my-classes"));
  for (const hidden of ["review", "audit", "permissions", "settings", "exams"]) assert.ok(!ids.includes(hidden), hidden);
  const hm = { role: "HEADMASTER" as const, permissions: ["audit.read", "roles.manage", "results.approve", "exams.authorize", "reports.read", "students.read"] };
  const hmIds = navFor(hm).map((n) => n.id);
  assert.ok(hmIds.includes("audit") && hmIds.includes("permissions") && hmIds.includes("results") && !hmIds.includes("marks"));
  assert.equal(can(null, "x"), false);
});
