/** A first character that makes a spreadsheet run the cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell; a value holding a quote, comma or line break is quoted. */
export const csvCell = (v: string | number): string => {
  const raw = String(v);
  const s = FORMULA_START.test(raw) ? `'${raw}` : raw; // a display name starting with "=" must never run as a spreadsheet formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Rows of CSV text: quoted cells may hold commas, doubled quotes and line breaks; CRLF and LF both end a row; a leading BOM and empty lines are dropped. */
export function parseCsv(text: string): string[][] {
  const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let lineHasContent = false;
  const endRow = (): void => {
    row.push(cell);
    if (lineHasContent) rows.push(row);
    row = [];
    cell = "";
    lineHasContent = false;
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch !== '"') cell += ch;
      else if (body[i + 1] === '"') {
        cell += '"';
        i++;
      } else inQuotes = false;
      continue;
    }
    if (ch === '"' && cell === "") {
      inQuotes = true;
      lineHasContent = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
      lineHasContent = true;
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      endRow();
    } else {
      cell += ch;
      lineHasContent = true;
    }
  }
  endRow();
  return rows;
}

/** The value behind a cell that `csvCell` prefixed with `'` so a spreadsheet never runs it as a formula. */
export const stripFormulaGuard = (v: string): string => (v.startsWith("'") && FORMULA_START.test(v.slice(1)) ? v.slice(1) : v);
