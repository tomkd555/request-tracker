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
