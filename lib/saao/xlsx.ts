// Excel builders (spec §8.9). Values only, never formulas, so the file shows exactly the app's figures.
import ExcelJS from "exceljs";
import type { SaaoColumn } from "@/components/saao/columns";
import { reportStatusLines } from "./basis";
import type { EndingBalanceMatrix } from "./ending-balance";
import { toPeso } from "./money";
import type { DisplayRow } from "./rollup";

export type XlsxHeader = {
  lines: string[];
  title: string;
  fund: string;
  asOf: string;
  status: "draft" | "finalized" | "superseded";
  version: number;
  finalizedAt?: string | null;
  supersededByVersion?: number | null;
};

export type XlsxFooter = { basis: string[]; certifier: { name: string | null; title: string | null } };

export type SaaoWorkbookInput = XlsxFooter & {
  header: XlsxHeader;
  rows: DisplayRow[];
  columns: SaaoColumn[];
};

const NUM_FMT = "#,##0.00;-#,##0.00";
const FONT = { name: "Arial", size: 9 };

/** Merged, centred title rows; returns the next free row number. */
function writeHeader(ws: ExcelJS.Worksheet, h: XlsxHeader, width: number): number {
  let r = 1;
  const merged = (text: string, bold = false, size = 9) => {
    ws.mergeCells(r, 1, r, width);
    const c = ws.getCell(r, 1);
    c.value = text;
    c.font = { ...FONT, bold, size };
    c.alignment = { horizontal: "center" };
    r += 1;
  };
  const status = reportStatusLines(h);
  if (status.banner) merged(status.banner, true, 12);
  for (const l of h.lines) merged(l);
  merged(h.title, true, 11);
  merged(h.fund);
  merged(h.asOf);
  if (status.finalized) merged(status.finalized, true);
  return r + 1;
}

/** Basis of figures (with acknowledged unapproved movements) and the certification block; returns the next free row. */
function writeFooter(ws: ExcelJS.Worksheet, start: number, { basis, certifier }: XlsxFooter, width: number): number {
  let r = start;
  const text = (t: string, bold = false) => {
    ws.mergeCells(r, 1, r, width);
    const c = ws.getCell(r, 1);
    c.value = t;
    c.font = { ...FONT, bold };
    c.alignment = { wrapText: true, vertical: "top" };
    r += 1;
  };
  if (basis.length) {
    text("Basis of figures", true);
    for (const l of basis) text(l);
    r += 1;
  }
  text("Certified Correct:", true);
  r += 2;
  // never invent a signatory: blank when the book has none
  text(certifier.name ?? "", true);
  text(certifier.title ?? "");
  return r;
}

export function buildSaaoWorkbook(input: SaaoWorkbookInput): ExcelJS.Workbook {
  const { header, rows, columns, basis, certifier } = input;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("SAAO", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const width = 2 + columns.length;
  ws.getColumn(1).width = 46;
  ws.getColumn(2).width = 12;
  columns.forEach((_, i) => { ws.getColumn(3 + i).width = 16; });

  const headRow = writeHeader(ws, header, width);
  const hr = ws.getRow(headRow);
  ["Description", "Code", ...columns.map((c) => c.header)].forEach((t, i) => {
    const c = hr.getCell(i + 1);
    c.value = t;
    c.font = { ...FONT, bold: true };
    c.alignment = { horizontal: i < 2 ? "left" : "right", wrapText: true };
    c.border = { bottom: { style: "thin" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
  });
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: headRow }];

  let r = headRow + 1;
  for (const d of rows) {
    const row = ws.getRow(r);
    const a = row.getCell(1);
    a.value = d.label;
    a.alignment = { indent: d.depth };
    row.getCell(2).value = d.type === "node" ? (d.row.accountCode ?? null) : null;
    if (d.amounts) {
      columns.forEach((c, i) => {
        const cell = row.getCell(3 + i);
        const v = c.key === "pct" ? d.pct : toPeso(c.get(d.amounts!));
        if (v === null || !Number.isFinite(v)) return; // null % stays empty
        cell.value = v;
        cell.numFmt = c.key === "pct" ? "0.00" : NUM_FMT;
      });
    }
    for (let i = 1; i <= width; i++) {
      const cell = row.getCell(i);
      cell.font = { ...FONT, bold: d.type === "node" ? d.amounts === null : true };
      if (d.type === "grand") cell.border = { top: { style: "medium" } };
    }
    r += 1;
  }
  writeFooter(ws, r + 1, { basis, certifier }, width);
  return wb;
}

export function buildEndingBalanceWorkbook(m: EndingBalanceMatrix, header: XlsxHeader, footer: XlsxFooter): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ending Balance", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const width = 2 + m.classes.length;
  ws.getColumn(1).width = 46;
  for (let i = 2; i <= width; i++) ws.getColumn(i).width = 18;
  const headRow = writeHeader(ws, { ...header, title: "SUMMARY OF ENDING BALANCE" }, width);

  const hr = ws.getRow(headRow);
  ["Section", ...m.classes.map((c) => (c.code === "UNCLASSIFIED" ? c.name : c.code)), "Total"].forEach((t, i) => {
    const c = hr.getCell(i + 1);
    c.value = t;
    c.font = { ...FONT, bold: true };
    c.alignment = { horizontal: i === 0 ? "left" : "right" };
    c.border = { bottom: { style: "thin" } };
  });
  const put = (r: number, label: string, byClass: Record<string, number>, total: number, bold: boolean) => {
    const row = ws.getRow(r);
    row.getCell(1).value = label;
    m.classes.forEach((c, i) => {
      const v = byClass[c.code];
      if (v === undefined) return;
      row.getCell(2 + i).value = toPeso(v);
      row.getCell(2 + i).numFmt = NUM_FMT;
    });
    const t = row.getCell(2 + m.classes.length);
    t.value = toPeso(total);
    t.numFmt = NUM_FMT;
    for (let i = 1; i <= width; i++) {
      row.getCell(i).font = { ...FONT, bold };
      if (bold) row.getCell(i).border = { top: { style: "medium" } };
    }
  };
  let r = headRow + 1;
  for (const s of m.sections) put(r++, s.label, s.byClass, s.total, false);
  put(r++, "GRAND TOTAL", m.columnTotals, m.grand, true);
  r = writeFooter(ws, r + 1, footer, width) + 1;
  // AWAITING BUDGET OFFICE (R15)
  ws.mergeCells(r, 1, r, width);
  ws.getCell(r, 1).value = "Balance of Allotment by section and classification. The Summary of Ending Balance grouping is unconfirmed (R15).";
  ws.getCell(r, 1).font = FONT;
  return wb;
}
