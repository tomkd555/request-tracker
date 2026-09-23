import { childrenMap } from "../../shared/issueTree";
import type { Issue } from "../../shared/types";

export interface IssueRow { issue: Issue; depth: number }

const desc = (a: Issue, b: Issue): number => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
const asc = (a: Issue, b: Issue): number => -desc(a, b);

/**
 * Top-level rows sorted by `compare` (default: key descending); each row's descendants (those present in `issues`)
 * follow it depth-first in ascending key order. An issue whose parent is absent from `issues` becomes a top-level row.
 */
export function groupByParent(issues: Issue[], compare: (a: Issue, b: Issue) => number = desc): IssueRow[] {
  const children = childrenMap(issues);
  const rows: IssueRow[] = [];
  const walk = (parent: string, depth: number): void => {
    for (const c of [...(children.get(parent) ?? [])].sort(asc)) {
      rows.push({ issue: c, depth });
      walk(c.key, depth + 1);
    }
  };
  for (const top of [...(children.get(null) ?? [])].sort(compare)) {
    rows.push({ issue: top, depth: 0 });
    walk(top.key, 1);
  }
  return rows;
}
