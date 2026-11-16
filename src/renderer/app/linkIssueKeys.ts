// Issue keys written in Markdown text ("26-0012") become links to the issue.

import { mapOutsideCode, splitCode } from "./markdownCode";

// A key preceded by "/" is part of a URL path and stays as it is.
const ISSUE_KEY_IN_TEXT = /(?<![\w\-/])(\d{2}-\d{4,})(?![\w\]-])/g;

// Matched before a key can match inside it: a `[[wiki link]]`, a link destination `](...)` and a bare URL.
const SKIPPED = /\[\[[^\]\n]+\]\]|\]\([^)\n]*\)|https?:\/\/[^\s<>]+/;
const KEY_OR_SKIPPED = new RegExp(`${SKIPPED.source}|${ISSUE_KEY_IN_TEXT.source}`, "g");

/** Rewrites bare issue keys outside code as `[key](#/issues/key)`. A key that is already the text of a link (followed by `]`) is left alone. */
export function linkIssueKeys(src: string): string {
  return mapOutsideCode(src, (text) => text.replace(KEY_OR_SKIPPED, (m, key?: string) => (key === undefined ? m : `[${key}](#/issues/${key})`)));
}

/** Distinct issue keys mentioned outside code, in order of first appearance. */
export function mentionedKeys(src: string): string[] {
  const out: string[] = [];
  for (const [i, seg] of splitCode(src).entries()) {
    if (i % 2 === 1) continue;
    for (const m of seg.matchAll(KEY_OR_SKIPPED)) if (m[1] !== undefined && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
