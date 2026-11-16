import type { Issue } from "./types";

/** Levels an issue chain may span, the root counted as level 1: root, child, grandchild, and two more. */
export const MAX_DEPTH = 5;

function groupByParentKey(issues: Issue[], parentKeyOf: (issue: Issue) => string | null): Map<string | null, Issue[]> {
  const childrenByParentKey = new Map<string | null, Issue[]>();
  for (const issue of issues) {
    const parentKey = parentKeyOf(issue);
    childrenByParentKey.set(parentKey, [...(childrenByParentKey.get(parentKey) ?? []), issue]);
  }
  return childrenByParentKey;
}

/** Children per parent key, in the order given; a child whose parent is absent counts under null. */
export function childrenMap(issues: Issue[]): Map<string | null, Issue[]> {
  const keys = new Set(issues.map((issue) => issue.key));
  return groupByParentKey(issues, (issue) => (issue.parentKey !== null && keys.has(issue.parentKey) ? issue.parentKey : null));
}

/** childrenMap for drawing a tree: an issue whose parent chain loops back to it (hand-edited data) counts under null, so a walk from the top level reaches every issue. */
export function rootedChildrenMap(issues: Issue[]): Map<string | null, Issue[]> {
  const byKey = new Map(issues.map((issue) => [issue.key, issue]));
  const isOnParentCycle = (issue: Issue): boolean => {
    const visitedKeys = new Set<string>();
    for (let ancestorKey = issue.parentKey; ancestorKey !== null && !visitedKeys.has(ancestorKey); ancestorKey = byKey.get(ancestorKey)?.parentKey ?? null) {
      if (ancestorKey === issue.key) return true;
      visitedKeys.add(ancestorKey);
    }
    return false;
  };
  return groupByParentKey(issues, (issue) => (issue.parentKey !== null && byKey.has(issue.parentKey) && !isOnParentCycle(issue) ? issue.parentKey : null));
}

/** Root first, down to the issue's parent; empty for a root. Stops at a missing parent or a cycle. */
export function ancestorsOf(byKey: Map<string, Issue>, key: string): Issue[] {
  const ancestors: Issue[] = [];
  const visitedKeys = new Set([key]);
  let ancestorKey = byKey.get(key)?.parentKey ?? null;
  while (ancestorKey !== null && !visitedKeys.has(ancestorKey)) {
    const ancestor = byKey.get(ancestorKey);
    if (!ancestor) break;
    visitedKeys.add(ancestorKey);
    ancestors.unshift(ancestor);
    ancestorKey = ancestor.parentKey;
  }
  return ancestors;
}

/** `matches` plus every ancestor of a match found in `all`, in the order of `all`; `context` holds the keys that were added, so a filtered tree still shows where each match sits. */
export function withAncestors(all: Issue[], matches: Issue[]): { issues: Issue[]; context: Set<string> } {
  const byKey = new Map(all.map((issue) => [issue.key, issue]));
  const matchedKeys = new Set(matches.map((issue) => issue.key));
  const context = new Set<string>();
  for (const match of matches) {
    for (const ancestor of ancestorsOf(byKey, match.key)) if (!matchedKeys.has(ancestor.key)) context.add(ancestor.key);
  }
  return { issues: all.filter((issue) => matchedKeys.has(issue.key) || context.has(issue.key)), context };
}

/** Per issue with descendants: how many there are and how many of them `isDone` accepts. */
export function descendantCounts(issues: Issue[], isDone: (issue: Issue) => boolean): Map<string, { done: number; total: number }> {
  const childrenByParentKey = rootedChildrenMap(issues);
  const countsByKey = new Map<string, { done: number; total: number }>();
  const countUnder = (key: string): { done: number; total: number } => {
    let done = 0;
    let total = 0;
    for (const child of childrenByParentKey.get(key) ?? []) {
      const underChild = countUnder(child.key);
      done += underChild.done + (isDone(child) ? 1 : 0);
      total += underChild.total + 1;
    }
    if (total > 0) countsByKey.set(key, { done, total });
    return { done, total };
  };
  for (const root of childrenByParentKey.get(null) ?? []) countUnder(root.key);
  return countsByKey;
}

/** 1 for a root, 2 for its child, and so on. */
export const depthOf = (byKey: Map<string, Issue>, key: string): number => ancestorsOf(byKey, key).length + 1;

/** The issue and everything under it. */
export function descendantKeysOf(issues: Issue[], key: string): Set<string> {
  const childrenByParentKey = childrenMap(issues);
  const keys = new Set<string>();
  const collect = (subtreeKey: string): void => {
    keys.add(subtreeKey);
    for (const child of childrenByParentKey.get(subtreeKey) ?? []) if (!keys.has(child.key)) collect(child.key);
  };
  collect(key);
  return keys;
}

/** Levels in the subtree rooted at the issue: 1 for a leaf. */
export function heightOf(issues: Issue[], key: string): number {
  const childrenByParentKey = childrenMap(issues);
  const visitedKeys = new Set<string>();
  const heightUnder = (subtreeKey: string): number => {
    visitedKeys.add(subtreeKey);
    let height = 1;
    for (const child of childrenByParentKey.get(subtreeKey) ?? []) if (!visitedKeys.has(child.key)) height = Math.max(height, heightUnder(child.key) + 1);
    return height;
  };
  return heightUnder(key);
}

export const CYCLE = "cycle";
const TOO_DEEP = "too-deep";

/**
 * Why `parentKey` may not become the parent of `key` (null for a new issue): "cycle" when it is the issue or one under it,
 * "too-deep" when the chain would pass MAX_DEPTH levels; null when the parent is allowed.
 */
export function parentRefusal(issues: Issue[], key: string | null, parentKey: string): string | null {
  if (key !== null && descendantKeysOf(issues, key).has(parentKey)) return CYCLE;
  const byKey = new Map(issues.map((issue) => [issue.key, issue]));
  const height = key !== null && byKey.has(key) ? heightOf(issues, key) : 1;
  return depthOf(byKey, parentKey) + height > MAX_DEPTH ? TOO_DEEP : null;
}
