// Finds the code in Markdown text (fenced blocks, indented blocks, inline spans) so link rewriting leaves it alone.

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]/;
const INDENTED = /^(?: {4}|\t)/;

/** One flag per line: true when the line belongs to a fenced block or an indented code block. */
export function codeLineFlags(lines: string[]): boolean[] {
  const flags: boolean[] = [];
  let fence: { char: string; len: number } | null = null;
  let prevBlank = true;
  let prevCode = false;
  let inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\r?\n?$/, "");
    const blank = line.trim() === "";
    let code = false;
    if (fence) {
      code = true;
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) fence = null;
    } else {
      const open = FENCE_OPEN.exec(line);
      if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
        code = true;
        fence = { char: open[1][0], len: open[1].length };
      } else if (!blank && INDENTED.test(line)) {
        code = !inList && (prevBlank || prevCode);
      } else if (!blank) {
        inList = LIST_ITEM.test(line) || (inList && !prevBlank);
      }
    }
    flags.push(code);
    prevBlank = blank;
    prevCode = code;
  }
  return flags;
}

const INLINE_CODE = /(`+[\s\S]*?`+)/;

/** Splits on code so that even indexes are text and odd indexes are code (fenced, indented or inline). */
export function splitCode(src: string): string[] {
  const lines = src.split(/(?<=\n)/);
  const flags = codeLineFlags(lines);
  const out: string[] = [];
  const push = (s: string, code: boolean): void => {
    if (code !== (out.length % 2 === 1)) out.push("");
    out.push(s);
  };
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j < lines.length && flags[j] === flags[i]) j++;
    const chunk = lines.slice(i, j).join("");
    if (flags[i]) push(chunk, true);
    else chunk.split(INLINE_CODE).forEach((s, k) => push(s, k % 2 === 1));
    i = j;
  }
  return out;
}
