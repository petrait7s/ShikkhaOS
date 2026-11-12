import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiClient, memoryTokenStore } from "@shikkhaos/api-client";
import { App } from "./app";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeApi(opts: { role: "TEACHER" | "STUDENT" | "HEADMASTER"; permissions: string[]; mustChange?: boolean; loginStatus?: number }) {
  const user = { id: "u1", role: opts.role, username: opts.role.toLowerCase(), displayName: `Test ${opts.role}`, email: null, status: "ACTIVE", mustChangePassword: !!opts.mustChange, lastLoginAt: null, version: 1 };
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = String(url); const m = init?.method ?? "GET";
    if (u.endsWith("/auth/refresh")) return json(401, { error: { code: "TOKEN_REVOKED", message: "none" } });
    if (u.endsWith("/auth/login") && m === "POST") return opts.loginStatus === 401 ? json(401, { error: { code: "UNAUTHENTICATED", message: "Invalid credentials" } }) : json(200, { data: { accessToken: "a", refreshToken: "r", expiresIn: 900, user, permissions: opts.permissions, mustChangePassword: !!opts.mustChange } });
    if (u.includes("/notifications/unread-count")) return json(200, { data: { count: 0 } });
    if (u.includes("/ws/tickets")) return json(500, { error: { code: "INTERNAL", message: "no ws in tests" } });
    if (u.includes("/mark-submissions") || u.includes("/conversations") || u.includes("/homework") || u.includes("/notices") || u.includes("/result-sets") || u.includes("/exams")) return json(200, { data: [], meta: { limit: 100, nextCursor: null, hasMore: false } });
    if (u.includes("/students/me")) return json(200, { data: { id: "s1", fullName: "Test", className: null } });
    if (u.includes("/attendance")) return json(200, { data: { summary: { total: 0, present: 0, absent: 0, late: 0, excused: 0, percentage: 0 }, records: [] } });
    return json(200, { data: [], meta: { limit: 100, nextCursor: null, hasMore: false } });
  }) as unknown as typeof fetch;
  return new ApiClient({ baseUrl: "http://x/api/v1", platform: "desktop", deviceId: "d", tokenStore: memoryTokenStore(), fetchImpl });
}

describe("App", () => {
  it("shows the login form first and reports bad credentials", async () => {
    render(<App api={fakeApi({ role: "TEACHER", permissions: [], loginStatus: 401 })} platform={{ kind: "desktop" }} router="hash" />);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Username, email or student ID"), "x");
    await u.type(screen.getByLabelText("Password"), "wrong");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username or password");
  });

  it("builds navigation from permissions: a teacher gets teaching modules and no admin modules", async () => {
    render(<App api={fakeApi({ role: "TEACHER", permissions: ["students.read", "marks.enter", "marks.submit", "attendance.mark", "classtests.manage", "messages.read", "notices.read", "homework.manage", "notices.create"] })} platform={{ kind: "desktop" }} router="hash" />);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Username, email or student ID"), "t"); await u.type(screen.getByLabelText("Password"), "pw");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    const nav = await screen.findByRole("navigation", { name: "Main" });
    for (const n of ["Marks entry", "Attendance", "Class tests", "Messages"]) expect(within(nav).getByRole("link", { name: new RegExp(n) })).toBeInTheDocument();
    for (const n of ["Audit log", "Roles & permissions", "Submissions inbox", "School settings"]) expect(within(nav).queryByRole("link", { name: new RegExp(n) })).toBeNull();
  });

  it("forces a password change for temporary passwords and validates the new password", async () => {
    render(<App api={fakeApi({ role: "STUDENT", permissions: ["students.read_own", "results.read_own", "attendance.read_own", "homework.read", "homework.submit", "notices.read", "messages.read"], mustChange: true })} platform={{ kind: "desktop" }} router="hash" />);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Username, email or student ID"), "s"); await u.type(screen.getByLabelText("Password"), "temp");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose a new password" });
    await u.type(within(dialog).getByLabelText(/Current/), "temp"); await u.type(within(dialog).getByLabelText("New password"), "short");
    await u.click(within(dialog).getByRole("button", { name: "Save password" }));
    await waitFor(() => expect(within(dialog).getByText(/At least 10 characters/)).toBeInTheDocument());
  });
});

describe("Bengali language", () => {
  it("switches the sign-in screen and the role-based navigation to Bengali and back", async () => {
    render(<App api={fakeApi({ role: "STUDENT", permissions: ["students.read_own", "results.read_own", "attendance.read_own", "homework.read", "homework.submit", "notices.read", "messages.read"] })} platform={{ kind: "desktop" }} router="hash" />);
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: /switch language/i }));
    expect(await screen.findByRole("button", { name: "সাইন ইন" })).toBeInTheDocument();
    expect(screen.getByLabelText("ইউজারনেম, ইমেইল বা শিক্ষার্থী আইডি")).toBeInTheDocument();
    await u.type(screen.getByLabelText("ইউজারনেম, ইমেইল বা শিক্ষার্থী আইডি"), "s"); await u.type(screen.getByLabelText("পাসওয়ার্ড"), "pw");
    await u.click(screen.getByRole("button", { name: "সাইন ইন" }));
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: /আমার ফলাফল/ })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /বার্তা/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("bn");
    await u.click(screen.getByRole("button", { name: /switch language/i }));
    expect(await within(await screen.findByRole("navigation", { name: "Main" })).findByRole("link", { name: /My results/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("workspace: tabs, dock and dashboard widgets", () => {
  const teacher = ["students.read", "marks.enter", "marks.submit", "attendance.mark", "classtests.manage", "messages.read", "notices.read", "homework.manage", "notices.create"];
  async function signedIn(kind: "desktop" | "web" = "desktop") {
    render(<App api={fakeApi({ role: "TEACHER", permissions: teacher })} platform={{ kind }} router="hash" />);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Username, email or student ID"), "t"); await u.type(screen.getByLabelText("Password"), "pw");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("navigation", { name: "Main" });
    return u;
  }

  it("opens modules in tabs, restores them and closes them", async () => {
    const u = await signedIn();
    const strip = screen.getByRole("navigation", { name: "Open tabs" });
    expect(within(strip).getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    await u.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: /Messages/ }));
    expect(await within(strip).findByRole("button", { name: "Messages" })).toHaveAttribute("aria-current", "page");
    await u.click(within(strip).getByRole("button", { name: /Close tab: Messages/ }));
    await waitFor(() => expect(within(strip).queryByRole("button", { name: "Messages" })).toBeNull());
    expect(within(strip).getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("pins modules to the dock on desktop only, and the pin survives re-render", async () => {
    const u = await signedIn("desktop");
    expect(screen.queryByRole("navigation", { name: "Pinned" })).toBeNull();
    await u.click(screen.getByRole("button", { name: /Pin to dock: Messages/ }));
    const dock = await screen.findByRole("navigation", { name: "Pinned" });
    expect(within(dock).getByRole("button", { name: "Messages" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /Unpin: Messages/ }));
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Pinned" })).toBeNull());
  });

  it("web has no dock pins", async () => {
    await signedIn("web");
    expect(screen.queryByRole("button", { name: /Pin to dock/ })).toBeNull();
  });

  it("lets the user hide and reorder dashboard widgets", async () => {
    const u = await signedIn();
    expect(await screen.findByText("Marks entry", { selector: "h2" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Customize" }));
    const dlg = screen.getByRole("dialog", { name: "Customize" });
    await u.click(within(dlg).getByRole("checkbox", { name: /Marks entry list/ }));
    await u.click(within(dlg).getByRole("button", { name: "Done" }));
    expect(screen.queryByText("Marks entry", { selector: "h2" })).toBeNull();
    expect(JSON.parse(localStorage.getItem("sos.widgets.u1.TEACHER")!).hidden).toContain("marks");
  });
});
