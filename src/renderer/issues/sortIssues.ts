import { ISSUE_PRIORITIES, type Issue, type Milestone, type StatusDef } from "../../shared/types";
import { compareKeys, compareText } from "./compareKeys";
import { orderMilestones } from "./milestones";

export const FIXED_SORT_KEYS = ["key", "summary", "category", "assignee", "status", "priority", "dueDate", "updatedAt", "milestone"] as const;
type FixedKey = (typeof FIXED_SORT_KEYS)[number];
/** The prefix of a sort key that names a 汎用列. */
export const FIELD_SORT_PREFIX = "field:";
/** A fixed column, or a 汎用列 as "field:<CustomField id>". */
export type SortKey = FixedKey | `${typeof FIELD_SORT_PREFIX}${string}`;
export interface IssueSort { key: SortKey; dir: "asc" | "desc" }

export const DEFAULT_SORT: IssueSort = { key: "key", dir: "desc" };

export const fieldSortKey = (id: string): SortKey => `${FIELD_SORT_PREFIX}${id}`;

/** A missing value after a present one in either direction; `compared` decides between two present values. */
const missingLast = (isMissingA: boolean, isMissingB: boolean, compared: () => number): number =>
  isMissingA && !isMissingB ? 1 : isMissingB && !isMissingA ? -1 : compared();

/**
 * Comparator for top-level rows. An empty assignee, 汎用列, due date or milestone sorts last in either direction; ties fall back to key descending.
 * Status follows the project's order, and milestone follows the due date order of `milestones` (see orderMilestones).
 */
export function issueComparator(sort: IssueSort, nameOf: (username: string | null) => string, statuses: StatusDef[], milestones: Milestone[] = []): (a: Issue, b: Issue) => number {
  const sign = sort.dir === "asc" ? 1 : -1;
  const milestoneOrder = orderMilestones(milestones).map((m) => m.id);
  const milestoneRank = (i: Issue): number => milestoneOrder.indexOf(i.milestone ?? "");
  const statusIndex = (id: string): number => statuses.findIndex((s) => s.id === id);
  const emptyLast = (va: string, vb: string): number => missingLast(va === "", vb === "", () => compareText(va, vb) * sign);
  return (a, b) => comparePrimary(a, b) || compareKeys(b.key, a.key);

  function comparePrimary(a: Issue, b: Issue): number {
    switch (sort.key) {
      case "key":
        return compareKeys(a.key, b.key) * sign;
      case "summary":
      case "updatedAt":
        return compareText(a[sort.key], b[sort.key]) * sign;
      case "assignee":
        return emptyLast(nameOf(a.assignee), nameOf(b.assignee));
      case "category":
        return emptyLast(a.category, b.category);
      case "dueDate":
        return emptyLast(a.dueDate ?? "", b.dueDate ?? "");
      case "milestone": {
        const ra = milestoneRank(a);
        const rb = milestoneRank(b);
        return missingLast(ra === -1, rb === -1, () => (ra - rb) * sign);
      }
      case "status":
        return (statusIndex(a.status) - statusIndex(b.status)) * sign;
      case "priority":
        return (ISSUE_PRIORITIES.indexOf(a.priority) - ISSUE_PRIORITIES.indexOf(b.priority)) * sign;
      default: {
        const id = sort.key.slice(FIELD_SORT_PREFIX.length);
        return emptyLast(a.fields[id] ?? "", b.fields[id] ?? "");
      }
    }
  }
}

/** Clicking the same header flips the direction; a new header starts ascending, except key and updatedAt which start descending. */
export function nextSort(current: IssueSort, key: SortKey): IssueSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "key" || key === "updatedAt" ? "desc" : "asc" };
}
