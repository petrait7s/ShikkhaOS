import { describe, expect, it } from "vitest";
import { routeFor } from "./routes";
import { canPost, convTitle } from "./format";

describe("deep links", () => {
  it("maps notification deep links to screens", () => {
    expect(routeFor("shikkhaos://results/abc")).toBe("/(tabs)/results");
    expect(routeFor("shikkhaos://attendance")).toBe("/(tabs)/attendance");
    expect(routeFor("shikkhaos://messages/42")).toBe("/messages/42");
    expect(routeFor("shikkhaos://messages")).toBe("/(tabs)/messages");
    expect(routeFor("shikkhaos://homework/9")).toBe("/homework/9");
    expect(routeFor("shikkhaos://notices/1")).toBe("/notices");
    expect(routeFor("shikkhaos://class-tests")).toBe("/class-tests");
    expect(routeFor(undefined)).toBe("/notifications");
    expect(routeFor("shikkhaos://unknown/1")).toBe("/notifications");
  });
});

describe("messaging helpers", () => {
  it("titles conversations and enforces student posting rules", () => {
    expect(convTitle({ type: "DIRECT", peer: { userId: "u", displayName: "Rahim Sir", role: "TEACHER" }, title: null })).toBe("Rahim Sir");
    expect(convTitle({ type: "CLASS_GROUP", peer: null, title: "Class 6-A" })).toBe("Class 6-A");
    expect(canPost({ type: "DIRECT", studentsCanPost: false })).toBe(true);
    expect(canPost({ type: "CLASS_GROUP", studentsCanPost: false })).toBe(false);
    expect(canPost({ type: "CLASS_GROUP", studentsCanPost: true })).toBe(true);
    expect(canPost({ type: "CHANNEL", studentsCanPost: true })).toBe(false);
  });
});
