import { useCallback, useState } from "react";

// Per machine, as the seen stamps are: the list, the detail screen and the Gantt chart fold the same parents.
const STORAGE_KEY = "collapsed-issues";

/** The keys stored as a JSON list; anything else reads as nothing collapsed. */
export function parseCollapsed(text: string | null): Set<string> {
  try {
    const v: unknown = JSON.parse(text ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

export function toggled(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

const readCollapsed = (): Set<string> => {
  try {
    return parseCollapsed(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return new Set();
  }
};

/** The parents whose rows are folded, and the toggle for one of them; the set outlives the screen. */
export function useCollapsed(): [Set<string>, (key: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const toggle = useCallback((key: string): void => {
    setCollapsed((c) => {
      const next = toggled(c, key);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable: the fold lasts as long as the screen
      }
      return next;
    });
  }, []);
  return [collapsed, toggle];
}
