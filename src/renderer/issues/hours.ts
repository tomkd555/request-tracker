import { descendantKeysOf } from "../../shared/issueTree";
import type { Issue } from "../../shared/types";

/** The text of a 予定時間 or 実績時間 field: a value (null when cleared) or a refusal. A value passes isHours: 0 or more, at most 2 decimal places. */
export type HoursParse = { ok: true; value: number | null } | { ok: false };

const HOURS_TEXT = /^\d+(\.\d{1,2})?$/;

export function parseHours(text: string): HoursParse {
  const t = text.trim();
  if (t === "") return { ok: true, value: null };
  return HOURS_TEXT.test(t) ? { ok: true, value: Number(t) } : { ok: false };
}

export const formatHours = (hours: number | null | undefined): string => (hours == null ? "" : String(hours));

export interface HoursTotal { estimated: number; actual: number }

// Rounded to the 2 decimals a value may carry, so 0.1 + 0.2 reads as 0.3.
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Sums 予定時間 and 実績時間; a missing value counts as nothing. */
export function sumHours(issues: Issue[]): HoursTotal {
  return {
    estimated: round2(issues.reduce((n, i) => n + (i.estimatedHours ?? 0), 0)),
    actual: round2(issues.reduce((n, i) => n + (i.actualHours ?? 0), 0)),
  };
}

/** The totals of the issue and everything under it. */
export function subtreeHours(issues: Issue[], key: string): HoursTotal {
  const keys = descendantKeysOf(issues, key);
  return sumHours(issues.filter((i) => keys.has(i.key)));
}
