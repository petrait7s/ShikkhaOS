import test from "node:test";
import assert from "node:assert/strict";
import { checkMarks, password, phoneBd, studentCode, username } from "./index.ts";

test("marks boundaries", () => {
  assert.equal(checkMarks("100", 100, false).ok, true);
  assert.equal(checkMarks("100.01", 100, false).ok, false);
  assert.equal(checkMarks("-1", 100, false).ok, false);
  assert.equal(checkMarks("12.345", 100, false).ok, false);
  assert.equal(checkMarks("12.34", 100, false).ok, true);
  assert.equal(checkMarks("5", 100, true).ok, false);
  assert.equal(checkMarks("", 100, true).ok, true);
});
test("shared field rules", () => {
  assert.ok(username.safeParse("teacher.rahim").success && !username.safeParse("Ab").success);
  assert.ok(password.safeParse("Tr1cky-Horse9").success && !password.safeParse("Password123").success && !password.safeParse("short1").success);
  assert.ok(phoneBd.safeParse("01712345678").success && phoneBd.safeParse("+8801712345678").success && !phoneBd.safeParse("0271234567").success);
  assert.ok(studentCode.safeParse("S-2026-001").success && !studentCode.safeParse("abc").success);
});
