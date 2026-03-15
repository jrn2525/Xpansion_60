import * as XLSX from "xlsx";

export interface ParsedRow {
  [key: string]: string;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
}

const MAX_ROWS = 10000;
const MAX_COLS = 50;

export function parseFileBuffer(buffer: Buffer, filename: string): ParseResult {
  const ext = filename.toLowerCase().split(".").pop();
  const allowedExts = ["csv", "xlsx", "xls"];
  if (!ext || !allowedExts.includes(ext)) {
    throw new Error(`Unsupported file type ".${ext}". Accepted formats: CSV, Excel (.xlsx, .xls)`);
  }

  let workbook: XLSX.WorkBook;
  try {
    if (ext === "csv") {
      workbook = XLSX.read(buffer, { type: "buffer", raw: true });
    } else {
      workbook = XLSX.read(buffer, { type: "buffer" });
    }
  } catch (e: any) {
    throw new Error(`Failed to parse file: ${e.message || "Invalid file format"}`);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (raw.length < 2) return { headers: [], rows: [] };

  const headerRow = raw[0];
  if (headerRow.length > MAX_COLS) {
    throw new Error(`File has ${headerRow.length} columns (max ${MAX_COLS}). Check file format.`);
  }

  const headers = headerRow.map((h: any) => String(h).trim());

  const dataRows = raw.slice(1);
  if (dataRows.length > MAX_ROWS) {
    throw new Error(`File has ${dataRows.length} data rows (max ${MAX_ROWS}). Split into smaller files.`);
  }

  const rows: ParsedRow[] = [];

  for (const rowArr of dataRows) {
    if (!rowArr || rowArr.every((c: any) => String(c).trim() === "")) continue;
    const rowData: ParsedRow = {};
    headers.forEach((h, idx) => {
      let val = rowArr[idx];
      if (typeof val === "number" && h.toLowerCase().includes("date")) {
        const d = excelDateToJSDate(val);
        rowData[h] = formatDate(d);
      } else {
        rowData[h] = String(val ?? "").trim();
      }
    });
    rows.push(rowData);
  }

  return { headers, rows };
}

function excelDateToJSDate(serial: number): Date {
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

function formatDate(d: Date): string {
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
