import { rootedChildrenMap } from "../../shared/issueTree";
import type { Issue } from "../../shared/types";
import { compareKeys } from "./compareKeys";

export interface IssueRow { issue: Issue; depth: number }
/** A row of a tree with a toggle: `collapsed` is true for a parent whose rows below it are left out. */
export interface TreeRow extends IssueRow { hasChildren: boolean; collapsed: boolean }

const desc = (a: Issue, b: Issue): number => compareKeys(b.key, a.key);
const asc = (a: Issue, b: Issue): number => -desc(a, b);

/**
 * Top-level rows sorted by `compare` (default: key descending); each row's descendants (those present in `issues`)
 * follow it depth-first in ascending key order. An issue whose parent is absent from `issues` becomes a top-level row.
 * The rows under a key in `collapsed` are left out.
 */
export function treeRows(issues: Issue[], compare: (a: Issue, b: Issue) => number = desc, collapsed: Set<string>): TreeRow[] {
  const children = rootedChildrenMap(issues);
  const rows: TreeRow[] = [];
  const push = (issue: Issue, depth: number): void => {
    const hasChildren = (children.get(issue.key) ?? []).length > 0;
    const closed = hasChildren && collapsed.has(issue.key);
    rows.push({ issue, depth, hasChildren, collapsed: closed });
    if (!closed) for (const c of [...(children.get(issue.key) ?? [])].sort(asc)) push(c, depth + 1);
  };
  for (const top of [...(children.get(null) ?? [])].sort(compare)) push(top, 0);
  return rows;
}

/** What a key pressed on a focused tree row does: Right opens a collapsed parent, Left folds an open one, Up and Down move, Enter opens the issue. */
export function treeKeyAction(key: string, row: { hasChildren: boolean; collapsed: boolean }): "toggle" | "next" | "previous" | "open" | null {
  if (key === "ArrowRight") return row.hasChildren && row.collapsed ? "toggle" : null;
  if (key === "ArrowLeft") return row.hasChildren && !row.collapsed ? "toggle" : null;
  if (key === "ArrowDown") return "next";
  if (key === "ArrowUp") return "previous";
  return key === "Enter" ? "open" : null;
}

/** The whole tree as rows, nothing collapsed. */
export function groupByParent(issues: Issue[], compare: (a: Issue, b: Issue) => number = desc): IssueRow[] {
  return treeRows(issues, compare, new Set());
}
