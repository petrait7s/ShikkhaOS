import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiClient, memoryTokenStore } from "@shikkhaos/api-client";
import { App } from "./app";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("student CSV import", () => {
  it("validates first, shows line-level problems, imports only a valid file and offers credentials once", async () => {
    const posts: { dryRun: boolean }[] = [];
    const user = { id: "u1", role: "REGISTRAR", username: "registrar", displayName: "Reg", email: null, status: "ACTIVE", mustChangePassword: false, lastLoginAt: null, version: 1 };
    const fetchImpl = (async (url: string, init: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/auth/refresh")) return json(401, { error: { code: "TOKEN_REVOKED", message: "x" } });
      if (u.endsWith("/auth/login")) return json(200, { data: { accessToken: "a", refreshToken: "r", expiresIn: 900, user, permissions: ["students.read", "students.create", "messages.read"], mustChangePassword: false } });
      if (u.endsWith("/students/import")) {
        const b = JSON.parse(String(init.body)); posts.push({ dryRun: b.dryRun });
        if (b.csv.includes("BAD")) return json(200, { data: { dryRun: true, total: 2, valid: 1, created: 0, errors: [{ line: 3, field: "dob", message: "Use a past date as YYYY-MM-DD" }] } });
        return b.dryRun ? json(200, { data: { dryRun: true, total: 1, valid: 1, created: 0, errors: [] } }) : json(201, { data: { dryRun: false, total: 1, valid: 1, created: 1, errors: [], credentials: [{ studentCode: "S-1", username: "s-1", fullName: "A B", temporaryPassword: "Tmp123abc9x" }] } });
      }
      if (u.includes("/ws/tickets")) return json(500, { error: { code: "INTERNAL", message: "no ws" } });
      return json(200, { data: [], meta: { limit: 50, nextCursor: null, hasMore: false } });
    }) as unknown as typeof fetch;
    const api = new ApiClient({ baseUrl: "http://x/api/v1", platform: "desktop", deviceId: "d", tokenStore: memoryTokenStore(), fetchImpl });
    window.location.hash = "#/students";
    render(<App api={api} platform={{ kind: "desktop" }} router="hash" />);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Username, email or student ID"), "r"); await u.type(screen.getByLabelText("Password"), "pw"); await u.click(screen.getByRole("button", { name: "Sign in" }));
    await u.click(await screen.findByRole("button", { name: "Import CSV" }));
    const dlg = await screen.findByRole("dialog", { name: "Import students from CSV" });
    const importBtn = within(dlg).getByRole("button", { name: /Import 0 students/ });
    expect(importBtn).toBeDisabled();
    await u.click(within(dlg).getByLabelText(/paste CSV text/i)); await u.paste("studentCode,fullName,dob,gender\nS-1,A,BAD,MALE");
    await u.click(within(dlg).getByRole("button", { name: "Check file" }));
    expect(await within(dlg).findByText("1 problem")).toBeInTheDocument();
    expect(within(dlg).getByText("Use a past date as YYYY-MM-DD")).toBeInTheDocument();
    expect(within(dlg).getByRole("button", { name: /Import 1 students/ })).toBeDisabled();
    await u.clear(within(dlg).getByLabelText(/paste CSV text/i)); await u.click(within(dlg).getByLabelText(/paste CSV text/i)); await u.paste("studentCode,fullName,dob,gender\nS-1,A B,2014-01-01,MALE");
    await u.click(within(dlg).getByRole("button", { name: "Check file" }));
    expect(await within(dlg).findByText("File is valid")).toBeInTheDocument();
    await u.click(within(dlg).getByRole("button", { name: /Import 1 students/ }));
    expect(await within(dlg).findByText(/Temporary passwords are shown once/)).toBeInTheDocument();
    expect(within(dlg).getByRole("button", { name: /Download credentials/ })).toBeInTheDocument();
    await waitFor(() => expect(posts.map((p) => p.dryRun)).toEqual([true, true, false]));
  });
});
