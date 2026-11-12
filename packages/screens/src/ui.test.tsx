import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@shikkhaos/api-client";
import { ConfirmDialog, Empty, ErrorState, StatusBadge, Table } from "./ui";
import { deepLinkToRoute } from "./app";

describe("StatusBadge", () => {
  it("uses text labels (never colour alone) for every lifecycle status", () => {
    const labels: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", CORRECTION_REQUESTED: "Correction requested", VERIFIED: "Verified", APPROVED: "Approved", PUBLISHED: "Published" };
    for (const [k, v] of Object.entries(labels)) { const { unmount } = render(<StatusBadge status={k} />); expect(screen.getByText(new RegExp(v, "i"))).toBeInTheDocument(); unmount(); }
  });
});

describe("Table", () => {
  const cols = [{ key: "n", header: "Name", render: (r: { n: string }) => r.n }];
  it("shows the empty state when there are no rows", () => {
    render(<Table rows={[]} rowKey={(r: { n: string }) => r.n} columns={cols} empty={<Empty title="Nothing here" />} />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
  it("rows are keyboard operable when clickable", () => {
    const onRow = vi.fn();
    render(<Table rows={[{ n: "Ayesha" }]} rowKey={(r) => r.n} columns={cols} onRow={onRow} />);
    const row = screen.getByText("Ayesha").closest("tr")!;
    fireEvent.keyDown(row, { key: "Enter" }); fireEvent.click(row);
    expect(onRow).toHaveBeenCalledTimes(2);
  });
});

describe("ErrorState", () => {
  it("shows request id and a retry action for server errors", () => {
    const retry = vi.fn();
    render(<ErrorState error={new ApiError(500, "INTERNAL", "Internal server error", [], "req-123")} onRetry={retry} />);
    expect(screen.getByText("Request ID req-123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(retry).toHaveBeenCalled();
  });
  it("renders the permission view for 403 and not-found for 404", () => {
    const { rerender } = render(<ErrorState error={new ApiError(403, "FORBIDDEN", "no")} />);
    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    rerender(<ErrorState error={new ApiError(404, "NOT_FOUND", "no")} />);
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });
  it("explains offline errors", () => {
    render(<ErrorState error={new ApiError(0, "NETWORK", "Cannot reach the server.")} />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("requires the typed phrase before the destructive action is enabled", async () => {
    const ok = vi.fn();
    render(<ConfirmDialog title="Publish" typed="PUBLISH" message="sure?" confirmLabel="Go" onConfirm={ok} onClose={() => {}} />);
    const go = screen.getByRole("button", { name: "Go" });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type "PUBLISH"/), { target: { value: "publish" } });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type "PUBLISH"/), { target: { value: "PUBLISH" } });
    expect(go).toBeEnabled(); fireEvent.click(go);
    await waitFor(() => expect(ok).toHaveBeenCalled());
  });
});

describe("deep links", () => {
  it("map shikkhaos:// links to the same routes on every platform", () => {
    expect(deepLinkToRoute("results/abc")).toBe("/my-results");
    expect(deepLinkToRoute("mark-submissions/abc")).toBe("/marks");
    expect(deepLinkToRoute("exams/42")).toBe("/exams/42");
    expect(deepLinkToRoute("messages/9")).toBe("/messages/9");
    expect(deepLinkToRoute("nonsense/1")).toBe("/notifications");
  });
});
