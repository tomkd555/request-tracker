import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { Issue } from "../../shared/types";
import { useSession } from "../app/SessionContext";
import { withKnownStatus } from "./labels";

interface IssuesState {
  issues: Issue[];
  byKey: Map<string, Issue>;
  isLoaded: boolean;
  reload(): Promise<void>;
  /** Re-reads one record from the store and patches the map (removes it when gone). */
  refreshOne(key: string): Promise<void>;
  /** Keys the current member watches, read with the issues; a key whose issue is gone stays in the set and is ignored on screen. */
  watched: ReadonlySet<string>;
  /** Replaces the watched keys with the list a `watch.set` call returned. */
  setWatched(keys: string[]): void;
  /** Re-renders every reader after seen stamps changed in localStorage. */
  notifySeenChanged(): void;
}

const IssuesContext = createContext<IssuesState | null>(null);

export function IssuesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { statuses } = useSession().project;
  const [storedByKey, setStoredByKey] = useState<Map<string, Issue>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);
  const [watchedKeys, setWatchedKeys] = useState<string[]>([]);
  const [seenTick, setSeenTick] = useState(0);

  const refreshCount = useRef(0); // bumped by every refreshOne

  const reload = useCallback(async () => {
    for (;;) {
      const refreshesAtStart = refreshCount.current;
      const [list, keys] = await Promise.all([window.api.issues.list(), window.api.watch.list()]);
      // A list read that began before a save's own re-read holds the record as it was before the save, and would put it back: read again.
      if (refreshCount.current !== refreshesAtStart) continue;
      setStoredByKey(new Map(list.map((i) => [i.key, i])));
      setWatchedKeys(keys);
      setIsLoaded(true);
      return;
    }
  }, []);

  const notifySeenChanged = useCallback(() => setSeenTick((n) => n + 1), []);

  const refreshOne = useCallback(async (key: string) => {
    const issue = await window.api.issues.get(key);
    refreshCount.current++;
    setStoredByKey((m) => {
      const next = new Map(m);
      if (issue === null) next.delete(key);
      else next.set(key, issue);
      return next;
    });
  }, []);

  // No load here: the shell reads the share when a screen opens and on 更新 (see App.tsx).

  // An issue on a stage the project no longer lists reads as the first stage everywhere; its file changes on its next save.
  const value = useMemo<IssuesState>(() => {
    const issues = withKnownStatus([...storedByKey.values()], statuses);
    return { issues, byKey: new Map(issues.map((i) => [i.key, i])), isLoaded, reload, refreshOne, watched: new Set(watchedKeys), setWatched: setWatchedKeys, notifySeenChanged };
    // seenTick has no use in the body: a new value object makes the readers recompute what they derive from localStorage
  }, [storedByKey, statuses, isLoaded, reload, refreshOne, watchedKeys, notifySeenChanged, seenTick]);
  return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function useIssues(): IssuesState {
  const s = useContext(IssuesContext);
  if (s === null) throw new Error("useIssues outside IssuesProvider");
  return s;
}
