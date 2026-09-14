// Issue keys written in Markdown text ("26-0012") become links to the issue.

// A key preceded by "/" is part of a URL path and stays as it is.
const KEY = /(?<![\w\-/])(\d{2}-\d{4,})(?![\w\]\)-])/g;

/** Splits on backtick runs so fenced blocks and inline code spans stay untouched; odd segments are code. */
const splitCode = (src: string): string[] => src.split(/(`+[\s\S]*?`+)/);

/** Rewrites bare issue keys outside code as `[key](#/issues/key)`. A key already inside a link (followed by `]` or `)`) is left alone. */
export function linkIssueKeys(src: string): string {
  return splitCode(src)
    .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(KEY, (_m, key: string) => `[${key}](#/issues/${key})`)))
    .join("");
}

/** Distinct issue keys mentioned outside code, in order of first appearance. */
export function mentionedKeys(src: string): string[] {
  const out: string[] = [];
  for (const [i, seg] of splitCode(src).entries()) {
    if (i % 2 === 1) continue;
    for (const m of seg.matchAll(KEY)) if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
