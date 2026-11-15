import type { Issue } from "./types";

/** Levels an issue chain may span, the root counted as level 1: root, child, grandchild, and two more. */
export const MAX_DEPTH = 5;

/** Children per parent key, in the order given; a child whose parent is absent counts under null. */
export function childrenMap(issues: Issue[]): Map<string | null, Issue[]> {
  const keys = new Set(issues.map((i) => i.key));
  const out = new Map<string | null, Issue[]>();
  for (const i of issues) {
    const k = i.parentKey !== null && keys.has(i.parentKey) ? i.parentKey : null;
    out.set(k, [...(out.get(k) ?? []), i]);
  }
  return out;
}

/** childrenMap for drawing a tree: an issue whose parent chain loops back to it (hand-edited data) counts under null, so a walk from the top level reaches every issue. */
export function rootedChildrenMap(issues: Issue[]): Map<string | null, Issue[]> {
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const loops = (i: Issue): boolean => {
    const seen = new Set<string>();
    for (let cur = i.parentKey; cur !== null && !seen.has(cur); cur = byKey.get(cur)?.parentKey ?? null) {
      if (cur === i.key) return true;
      seen.add(cur);
    }
    return false;
  };
  const out = new Map<string | null, Issue[]>();
  for (const i of issues) {
    const k = i.parentKey !== null && byKey.has(i.parentKey) && !loops(i) ? i.parentKey : null;
    out.set(k, [...(out.get(k) ?? []), i]);
  }
  return out;
}

/** Root first, down to the issue's parent; empty for a root. Stops at a missing parent or a cycle. */
export function ancestorsOf(byKey: Map<string, Issue>, key: string): Issue[] {
  const out: Issue[] = [];
  const seen = new Set([key]);
  let cur = byKey.get(key)?.parentKey ?? null;
  while (cur !== null && !seen.has(cur)) {
    const i = byKey.get(cur);
    if (!i) break;
    seen.add(cur);
    out.unshift(i);
    cur = i.parentKey;
  }
  return out;
}

/** `matches` plus every ancestor of a match found in `all`, in the order of `all`; `context` holds the keys that were added, so a filtered tree still shows where each match sits. */
export function withAncestors(all: Issue[], matches: Issue[]): { issues: Issue[]; context: Set<string> } {
  const byKey = new Map(all.map((i) => [i.key, i]));
  const keep = new Set(matches.map((i) => i.key));
  const context = new Set<string>();
  for (const m of matches) for (const a of ancestorsOf(byKey, m.key)) if (!keep.has(a.key)) context.add(a.key);
  return { issues: all.filter((i) => keep.has(i.key) || context.has(i.key)), context };
}

/** Per issue with descendants: how many there are and how many of them `isDone` accepts. */
export function descendantCounts(issues: Issue[], isDone: (i: Issue) => boolean): Map<string, { done: number; total: number }> {
  const children = rootedChildrenMap(issues);
  const out = new Map<string, { done: number; total: number }>();
  const walk = (key: string): { done: number; total: number } => {
    let done = 0;
    let total = 0;
    for (const c of children.get(key) ?? []) {
      const sub = walk(c.key);
      done += sub.done + (isDone(c) ? 1 : 0);
      total += sub.total + 1;
    }
    if (total > 0) out.set(key, { done, total });
    return { done, total };
  };
  for (const top of children.get(null) ?? []) walk(top.key);
  return out;
}

/** 1 for a root, 2 for its child, and so on. */
export const depthOf = (byKey: Map<string, Issue>, key: string): number => ancestorsOf(byKey, key).length + 1;

/** The issue and everything under it. */
export function descendantKeysOf(issues: Issue[], key: string): Set<string> {
  const children = childrenMap(issues);
  const out = new Set<string>();
  const walk = (cur: string): void => {
    out.add(cur);
    for (const c of children.get(cur) ?? []) if (!out.has(c.key)) walk(c.key);
  };
  walk(key);
  return out;
}

/** Levels in the subtree rooted at the issue: 1 for a leaf. */
export function heightOf(issues: Issue[], key: string): number {
  const children = childrenMap(issues);
  const seen = new Set<string>();
  const walk = (cur: string): number => {
    seen.add(cur);
    let h = 1;
    for (const c of children.get(cur) ?? []) if (!seen.has(c.key)) h = Math.max(h, walk(c.key) + 1);
    return h;
  };
  return walk(key);
}

export const CYCLE = "cycle";
export const TOO_DEEP = "too-deep";

/**
 * Why `parentKey` may not become the parent of `key` (null for a new issue): "cycle" when it is the issue or one under it,
 * "too-deep" when the chain would pass MAX_DEPTH levels; null when the parent is allowed.
 */
export function parentRefusal(issues: Issue[], key: string | null, parentKey: string): string | null {
  if (key !== null && descendantKeysOf(issues, key).has(parentKey)) return CYCLE;
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const height = key !== null && byKey.has(key) ? heightOf(issues, key) : 1;
  return depthOf(byKey, parentKey) + height > MAX_DEPTH ? TOO_DEEP : null;
}
