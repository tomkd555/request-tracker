import { ISSUE_PRIORITIES, ISSUE_STATUSES, type Issue } from "../../shared/types";

export type SortKey = "key" | "summary" | "category" | "assignee" | "status" | "priority" | "dueDate" | "updatedAt";
export interface IssueSort { key: SortKey; dir: "asc" | "desc" }

export const DEFAULT_SORT: IssueSort = { key: "key", dir: "desc" };

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Comparator for top-level rows. An empty assignee and a missing due date sort last in either direction; ties fall back to key descending. */
export function issueComparator(sort: IssueSort, nameOf: (username: string | null) => string): (a: Issue, b: Issue) => number {
  const sign = sort.dir === "asc" ? 1 : -1;
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
        return (ISSUE_STATUSES.indexOf(a.status) - ISSUE_STATUSES.indexOf(b.status)) * sign;
      case "priority":
        return (ISSUE_PRIORITIES.indexOf(a.priority) - ISSUE_PRIORITIES.indexOf(b.priority)) * sign;
    }
  }
}

/** Clicking the same header flips the direction; a new header starts ascending, except key and updatedAt which start descending. */
export function nextSort(current: IssueSort, key: SortKey): IssueSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "key" || key === "updatedAt" ? "desc" : "asc" };
}
