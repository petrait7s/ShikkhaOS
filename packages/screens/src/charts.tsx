import * as React from "react";

export interface Datum { label: string; value: number }

/** Accessible horizontal bar chart: SVG with a text summary, and the same data as a visually-hidden table. Colors never carry meaning alone (values are printed). */
export function BarChart({ title, data, unit = "", max }: { title: string; data: Datum[]; unit?: string; max?: number }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  const rowH = 28, labelW = 150, w = 640, barW = w - labelW - 70;
  const summary = `${title}: ${data.map((d) => `${d.label} ${d.value}${unit}`).join(", ")}`;
  if (!data.length) return <div className="muted" role="status">No data to chart.</div>;
  return (
    <figure style={{ margin: 0 }}>
      <svg role="img" aria-label={summary} viewBox={`0 0 ${w} ${data.length * rowH + 8}`} width="100%" style={{ maxWidth: w }}>
        <title>{title}</title>
        {data.map((d, i) => {
          const len = Math.max(2, (d.value / top) * barW);
          return (
            <g key={d.label} transform={`translate(0 ${i * rowH + 4})`}>
              <text x={labelW - 8} y={rowH / 2 + 3} textAnchor="end" fontSize="12" fill="var(--text-2)">{d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label}</text>
              <rect x={labelW} y={3} width={len} height={rowH - 10} rx={4} fill="var(--accent)" />
              <text x={labelW + len + 6} y={rowH / 2 + 3} fontSize="12" fill="var(--text)" className="num">{Number.isInteger(d.value) ? d.value : d.value.toFixed(1)}{unit}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{summary}</figcaption>
      <table className="sr-only"><caption>{title}</caption><thead><tr><th scope="col">Item</th><th scope="col">Value</th></tr></thead><tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{d.value}{unit}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** Convert a report's rows into chart data (or null when the report has no meaningful chart). */
export function reportChart(key: string, rows: Record<string, unknown>[]): { title: string; data: Datum[]; unit?: string; max?: number } | null {
  const num = (v: unknown) => Number(v ?? 0);
  switch (key) {
    case "enrollment-summary": return { title: "Students per section", data: rows.map((r) => ({ label: `${r.className}-${r.sectionName}`, value: num(r.students) })) };
    case "attendance-summary": return { title: "Attendance % per section", unit: "%", max: 100, data: rows.map((r) => ({ label: `${r.className}-${r.sectionName}`, value: num(r.percentage) })) };
    case "exam-analysis": return { title: "Pass rate % per exam and class", unit: "%", max: 100, data: rows.map((r) => ({ label: `${r.examName} · ${r.className}`, value: num(r.passRate) })) };
    case "result-distribution": {
      const by = new Map<string, number>();
      rows.forEach((r) => by.set(String(r.grade), (by.get(String(r.grade)) ?? 0) + num(r.students)));
      return { title: "Students per grade", data: [...by].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value })) };
    }
    case "teacher-submission-status": return { title: "Verified submissions per teacher", data: rows.map((r) => ({ label: `${r.teacherName}`, value: num(r.verified) })) };
    default: return null;
  }
}
