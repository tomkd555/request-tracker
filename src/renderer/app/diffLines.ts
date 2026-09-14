// Line diff for the wiki history: an LCS over lines, then hunks with two lines of context.

export type DiffKind = "same" | "add" | "del";
export interface DiffLine { kind: DiffKind; text: string }

/** Every line of both texts, in order, marked same / added / deleted. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // ponytail: O(n·m) table; a page of a few thousand lines is still instant
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "del", text: a[i++] });
    } else {
      out.push({ kind: "add", text: b[j++] });
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++] });
  while (j < m) out.push({ kind: "add", text: b[j++] });
  return out;
}

/** The changed lines with `context` unchanged lines around each run; a gap between runs is one `null`. Empty when nothing changed. */
export function diffHunks(lines: DiffLine[], context = 2): (DiffLine | null)[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (DiffLine | null)[] = [];
  let gap = false;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (gap && out.length > 0) out.push(null);
      gap = false;
      out.push(l);
    } else {
      gap = true;
    }
  });
  return out;
}
