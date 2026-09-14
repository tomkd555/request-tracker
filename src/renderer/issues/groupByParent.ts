import type { Issue } from "../../shared/types";

export interface IssueRow { issue: Issue; depth: 0 | 1 }

const desc = (a: Issue, b: Issue): number => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
const asc = (a: Issue, b: Issue): number => -desc(a, b);

/**
 * Top-level rows sorted by `compare` (default: key descending); each row's children (those present in `issues`)
 * follow it in ascending key order. A child whose parent is absent from `issues` becomes a top-level row.
 */
export function groupByParent(issues: Issue[], compare: (a: Issue, b: Issue) => number = desc): IssueRow[] {
  const present = new Set(issues.map((i) => i.key));
  const tops = issues.filter((i) => i.parentKey === null || !present.has(i.parentKey)).sort(compare);
  const childrenOf = new Map<string, Issue[]>();
  for (const i of issues) {
    if (i.parentKey !== null && present.has(i.parentKey)) {
      childrenOf.set(i.parentKey, [...(childrenOf.get(i.parentKey) ?? []), i]);
    }
  }
  const rows: IssueRow[] = [];
  for (const top of tops) {
    rows.push({ issue: top, depth: 0 });
    for (const child of (childrenOf.get(top.key) ?? []).sort(asc)) rows.push({ issue: child, depth: 1 });
  }
  return rows;
}
