import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart, reportChart } from "./charts";

describe("charts", () => {
  it("renders an accessible chart with the same data as a table", () => {
    render(<BarChart title="Attendance % per section" unit="%" max={100} data={[{ label: "Class 6-A", value: 92.5 }, { label: "Class 6-B", value: 80 }]} />);
    expect(screen.getByRole("img", { name: /Class 6-A 92.5%, Class 6-B 80%/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Attendance % per section" })).toBeInTheDocument();
  });
  it("maps reports to chart data and aggregates grade distribution", () => {
    const c = reportChart("result-distribution", [{ grade: "A+", students: 3, class_name: "6" }, { grade: "A+", students: 2, class_name: "7" }, { grade: "B", students: 1, class_name: "6" }])!;
    expect(c.data).toEqual([{ label: "A+", value: 5 }, { label: "B", value: 1 }]);
    expect(reportChart("nope", [])).toBeNull();
    expect(reportChart("attendance-summary", [{ class_name: "6", section_name: "A", percentage: "91.5" }])!.data[0]!.value).toBe(91.5);
  });
  it("shows an empty state without data", () => {
    render(<BarChart title="x" data={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No data");
  });
});
