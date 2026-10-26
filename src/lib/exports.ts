/**
 * File downloads built in the browser, so private records never pass
 * through anything else on the way to the file.
 */

/** One CSV cell per RFC 4180: always quoted, inner quotes doubled. */
const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

/** CSV with a UTF-8 byte-order mark, so Excel reads accents and dashes correctly. */
export function downloadCsv(fileName: string, header: string[], rows: (string | number)[][]) {
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  download(fileName, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

export interface Sheet {
  name: string;
  header: string[];
  rows: (string | number | null)[][];
  /** Column indexes holding dollar amounts (numbers), formatted as currency. */
  money?: number[];
  /** Rows (0-based, after the header) to set in bold, e.g. totals. */
  bold?: number[];
}

/** An Excel workbook (.xlsx). ExcelJS is loaded only when it's needed. */
export async function downloadXlsx(fileName: string, sheets: Sheet[]) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  book.creator = 'Client dashboard';
  for (const s of sheets) {
    const ws = book.addWorksheet(s.name);
    ws.addRow(s.header).font = { bold: true };
    s.rows.forEach((row, i) => {
      const added = ws.addRow(row);
      if (s.bold?.includes(i)) added.font = { bold: true };
    });
    for (const col of s.money ?? []) ws.getColumn(col + 1).numFmt = '$#,##0.00;[Red]-$#,##0.00';
    ws.columns.forEach((column, i) => {
      const longest = Math.max(...[s.header, ...s.rows].map((r) => String(r[i] ?? '').length));
      column.width = Math.min(60, Math.max(10, longest + 2));
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  const buffer = await book.xlsx.writeBuffer();
  download(fileName, new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

function download(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
