import { ISSUE_PRIORITIES, type Issue, type StatusDef } from "../../shared/types";

type FixedKey = "key" | "summary" | "category" | "assignee" | "status" | "priority" | "dueDate" | "updatedAt";
/** A fixed column, or a 汎用列 as "field:<CustomField id>". */
export type SortKey = FixedKey | `field:${string}`;
export interface IssueSort { key: SortKey; dir: "asc" | "desc" }

export const DEFAULT_SORT: IssueSort = { key: "key", dir: "desc" };

export const fieldSortKey = (id: string): SortKey => `field:${id}`;

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Comparator for top-level rows. An empty assignee, 汎用列 or due date sorts last in either direction; ties fall back to key descending. Status follows the project's order. */
export function issueComparator(sort: IssueSort, nameOf: (username: string | null) => string, statuses: StatusDef[]): (a: Issue, b: Issue) => number {
  const sign = sort.dir === "asc" ? 1 : -1;
  const statusIndex = (id: string): number => statuses.findIndex((s) => s.id === id);
  const emptyLast = (va: string, vb: string): number => (va === "" && vb !== "" ? 1 : vb === "" && va !== "" ? -1 : cmpStr(va, vb) * sign);
  return (a, b) => primary(a, b) || cmpStr(b.key, a.key);

  function primary(a: Issue, b: Issue): number {
    switch (sort.key) {
      case "key":
      case "summary":
      case "updatedAt":
        return cmpStr(a[sort.key], b[sort.key]) * sign;
      case "assignee":
        return emptyLast(nameOf(a.assignee), nameOf(b.assignee));
      case "category":
        return emptyLast(a.category, b.category);
      case "dueDate":
        return emptyLast(a.dueDate ?? "", b.dueDate ?? "");
      case "status":
        return (statusIndex(a.status) - statusIndex(b.status)) * sign;
      case "priority":
        return (ISSUE_PRIORITIES.indexOf(a.priority) - ISSUE_PRIORITIES.indexOf(b.priority)) * sign;
      default: {
        const id = sort.key.slice("field:".length);
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
