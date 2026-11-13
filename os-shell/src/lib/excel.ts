export type Grid = string[][];

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return String(o.result);
    return "";
  }
  return String(v).trim();
}

export async function readGrid(file: File): Promise<{ sheet: string; grid: Grid }[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const out: { sheet: string; grid: Grid }[] = [];
  wb.eachSheet((ws) => {
    const grid: Grid = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      const n = Math.max(row.cellCount, row.actualCellCount);
      for (let c = 1; c <= n; c++) cells.push(cellText(row.getCell(c).value));
      grid.push(cells);
    });
    out.push({ sheet: ws.name, grid });
  });
  return out;
}

export type SheetSpec = { name: string; rows: (string | number)[][]; widths?: number[] };

export async function buildXlsx(sheets: SheetSpec[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    s.rows.forEach((r) => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1E7CE" } };
    ws.columns.forEach((c, i) => {
      c.width = s.widths?.[i] ?? 16;
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, " ").trim();
}
