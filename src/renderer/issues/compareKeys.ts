import type { Issue } from "../../shared/types";

const ISSUE_KEY_PARTS = /^(\d+)-(\d+)$/;

/** Orders two texts by code unit, the way `<` does. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Orders issue keys (`<fiscal year>-<number>`) by year, then by number, both numerically; text that is no key compares as text. */
export function compareKeys(a: string, b: string): number {
  const partsA = ISSUE_KEY_PARTS.exec(a);
  const partsB = ISSUE_KEY_PARTS.exec(b);
  if (partsA === null || partsB === null) return compareText(a, b);
  return Number(partsA[1]) - Number(partsB[1]) || Number(partsA[2]) - Number(partsB[2]);
}

export const byKeyAsc = (a: Issue, b: Issue): number => compareKeys(a.key, b.key);
export const byKeyDesc = (a: Issue, b: Issue): number => compareKeys(b.key, a.key);
