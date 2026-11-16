// Line diff for the wiki history: an LCS over lines, then hunks with two lines of context.

export type DiffKind = "same" | "add" | "del";
export interface DiffLine { kind: DiffKind; text: string }

/** Every line of both texts, in order, marked same / added / deleted. */
export function diffLines(before: string, after: string): DiffLine[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  // ponytail: O(n·m) table; a page of a few thousand lines is still instant
  const beforeCount = beforeLines.length;
  const afterCount = afterLines.length;
  const lcs: number[][] = Array.from({ length: beforeCount + 1 }, () => new Array<number>(afterCount + 1).fill(0));
  for (let i = beforeCount - 1; i >= 0; i--) {
    for (let j = afterCount - 1; j >= 0; j--) {
      lcs[i][j] = beforeLines[i] === afterLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < beforeCount && j < afterCount) {
    if (beforeLines[i] === afterLines[j]) {
      out.push({ kind: "same", text: beforeLines[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "del", text: beforeLines[i++] });
    } else {
      out.push({ kind: "add", text: afterLines[j++] });
    }
  }
  while (i < beforeCount) out.push({ kind: "del", text: beforeLines[i++] });
  while (j < afterCount) out.push({ kind: "add", text: afterLines[j++] });
  return out;
}

/** The changed lines with `context` unchanged lines around each run; a gap between runs is one `null`. Empty when nothing changed. */
export function diffHunks(lines: DiffLine[], context = 2): (DiffLine | null)[] {
  const isShown = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) isShown[k] = true;
  });
  const out: (DiffLine | null)[] = [];
  let gap = false;
  lines.forEach((line, i) => {
    if (isShown[i]) {
      if (gap && out.length > 0) out.push(null);
      gap = false;
      out.push(line);
    } else {
      gap = true;
    }
  });
  return out;
}
