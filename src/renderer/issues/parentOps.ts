import { descendantKeysOf } from "../../shared/issueTree";
import type { Issue, IssueStatus, StatusDef } from "../../shared/types";
import { addDays } from "./dates";
import { isDoneStatus } from "./labels";

/** The answer of the dialog a parent-aware operation opens. */
export type ParentAnswer = "all" | "only" | "cancel";

/** One issue to save: the record to write and the updatedAt the stored record must still carry. */
export interface Write { next: Issue; expected: string }

interface Stamp { updatedAt: string; updatedBy: string }

const below = (issues: Issue[], key: string): Issue[] => {
  const keys = descendantKeysOf(issues, key);
  return issues.filter((i) => i.key !== key && keys.has(i.key));
};

const stamped = (issue: Issue, patch: Partial<Issue>, stamp: Stamp): Write => ({ next: { ...issue, ...patch, ...stamp }, expected: issue.updatedAt });

/** Descendants at every level whose stage is not of kind done. */
export const openDescendants = (issues: Issue[], key: string, statuses: StatusDef[]): Issue[] => below(issues, key).filter((i) => !isDoneStatus(statuses, i.status));

/** Descendants at every level that have a start or a due date. */
export const datedDescendants = (issues: Issue[], key: string): Issue[] => below(issues, key).filter((i) => i.startDate !== null || i.dueDate !== null);

/** The issues saved when `parent` is set to the done stage `stage`: the parent first, then, for "all", each open descendant. */
export function completionWrites(issues: Issue[], parent: Issue, stage: IssueStatus, answer: ParentAnswer, statuses: StatusDef[], stamp: Stamp): Write[] {
  if (answer === "cancel") return [];
  const out = [stamped(parent, { status: stage }, stamp)];
  if (answer === "all") for (const d of openDescendants(issues, parent.key, statuses)) out.push(stamped(d, { status: stage }, stamp));
  return out;
}

/** The issues saved when the whole bar of `parent` moves by `days`: the parent with `dates`, then, for "all", each dated descendant shifted by the same days. */
export function moveWrites(issues: Issue[], parent: Issue, dates: { startDate: string | null; dueDate: string | null }, days: number, answer: ParentAnswer, stamp: Stamp): Write[] {
  if (answer === "cancel") return [];
  const out = [stamped(parent, dates, stamp)];
  if (answer === "all") {
    const shift = (d: string | null): string | null => (d === null ? null : addDays(d, days));
    for (const d of datedDescendants(issues, parent.key)) out.push(stamped(d, { startDate: shift(d.startDate), dueDate: shift(d.dueDate) }, stamp));
  }
  return out;
}

/** Saves the writes in order; a failure stops the run and is rethrown, and the writes before it stay saved. */
export async function applyWrites(writes: Write[], put: (next: Issue, expected: string) => Promise<unknown>, onWritten?: (next: Issue) => void): Promise<void> {
  for (const w of writes) {
    await put(w.next, w.expected);
    onWritten?.(w.next);
  }
}
