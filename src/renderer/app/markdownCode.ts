// Finds the code in Markdown text (fenced blocks, indented blocks, inline spans) so link rewriting leaves it alone.

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]/;
const INDENTED = /^(?: {4}|\t)/;

/** One flag per line: true when the line belongs to a fenced block or an indented code block. */
export function codeLineFlags(lines: string[]): boolean[] {
  const flags: boolean[] = [];
  let fence: { char: string; len: number } | null = null;
  let wasBlank = true;
  let wasCode = false;
  let isInList = false;
  for (const raw of lines) {
    const line = raw.replace(/\r?\n?$/, "");
    const isBlank = line.trim() === "";
    let isCode = false;
    if (fence) {
      isCode = true;
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) fence = null;
    } else {
      const open = FENCE_OPEN.exec(line);
      if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
        isCode = true;
        fence = { char: open[1][0], len: open[1].length };
      } else if (!isBlank && INDENTED.test(line)) {
        isCode = !isInList && (wasBlank || wasCode);
      } else if (!isBlank) {
        isInList = LIST_ITEM.test(line) || (isInList && !wasBlank);
      }
    }
    flags.push(isCode);
    wasBlank = isBlank;
    wasCode = isCode;
  }
  return flags;
}

const BLANK_LINE = /\n[ \t]*\n/;

/** Where the run of exactly `length` backticks that closes a span opened before `from` starts, or -1 when the paragraph holds none. */
function closingRunAt(text: string, from: number, length: number): number {
  const blankLineAt = text.slice(from).search(BLANK_LINE);
  const paragraphEnd = blankLineAt === -1 ? text.length : from + blankLineAt;
  for (const run of text.slice(from, paragraphEnd).matchAll(/`+/g)) {
    if (run[0].length === length) return from + run.index;
  }
  return -1;
}

/** Splits text outside code blocks into text and inline code spans, text first; an opening run with no closing run of its length is text. */
function splitInlineCode(text: string): string[] {
  const backtickRuns = /`+/g;
  const parts: string[] = [];
  let textStart = 0;
  let searchFrom = 0;
  for (;;) {
    backtickRuns.lastIndex = searchFrom;
    const open = backtickRuns.exec(text);
    if (open === null) break;
    const openEnd = open.index + open[0].length;
    const closeAt = closingRunAt(text, openEnd, open[0].length);
    if (closeAt === -1) {
      searchFrom = openEnd;
      continue;
    }
    const spanEnd = closeAt + open[0].length;
    parts.push(text.slice(textStart, open.index), text.slice(open.index, spanEnd));
    textStart = spanEnd;
    searchFrom = spanEnd;
  }
  parts.push(text.slice(textStart));
  return parts;
}

/** Splits on code so that even indexes are text and odd indexes are code (fenced, indented or inline). */
export function splitCode(src: string): string[] {
  const lines = src.split(/(?<=\n)/);
  const flags = codeLineFlags(lines);
  const out: string[] = [];
  const push = (segment: string, isCode: boolean): void => {
    if (isCode !== (out.length % 2 === 1)) out.push("");
    out.push(segment);
  };
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j < lines.length && flags[j] === flags[i]) j++;
    const chunk = lines.slice(i, j).join("");
    if (flags[i]) push(chunk, true);
    else splitInlineCode(chunk).forEach((part, k) => push(part, k % 2 === 1));
    i = j;
  }
  return out;
}

/** The source with `rewrite` applied to every stretch of text outside code; the code stays as it is. */
export function mapOutsideCode(src: string, rewrite: (text: string) => string): string {
  return splitCode(src)
    .map((segment, i) => (i % 2 === 1 ? segment : rewrite(segment)))
    .join("");
}
