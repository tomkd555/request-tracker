/** Rows of CSV text: quoted cells may hold commas, doubled quotes and line breaks; CRLF and LF both end a row; a leading BOM and empty lines are dropped. */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  let started = false; // the current line holds at least one character
  const endRow = (): void => {
    row.push(cur);
    if (started) rows.push(row);
    row = [];
    cur = "";
    started = false;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') cur += c;
      else if (src[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (c === '"' && cur === "") {
      quoted = true;
      started = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
      started = true;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      endRow();
    } else {
      cur += c;
      started = true;
    }
  }
  endRow();
  return rows;
}

/** The value behind a cell that `cell` (countByMonth) prefixed with `'` so a spreadsheet never runs it as a formula. */
export const uncell = (v: string): string => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);
