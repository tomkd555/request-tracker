import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Issue } from "../../shared/types";

export interface IssuesState {
  issues: Issue[];
  byKey: Map<string, Issue>;
  loaded: boolean;
  reload(): Promise<void>;
  /** Re-reads one record from the store and patches the map (removes it when gone). */
  refreshOne(key: string): Promise<void>;
}

const IssuesContext = createContext<IssuesState | null>(null);

export function IssuesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [byKey, setByKey] = useState<Map<string, Issue>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const list = await window.api.issues.list();
    setByKey(new Map(list.map((i) => [i.key, i])));
    setLoaded(true);
  }, []);

  const refreshOne = useCallback(async (key: string) => {
    const issue = await window.api.issues.get(key);
    setByKey((m) => {
      const next = new Map(m);
      if (issue === null) next.delete(key);
      else next.set(key, issue);
      return next;
    });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(
    () =>
      window.api.onChanged((e) => {
        if (e.collection === "issues") void refreshOne(e.id);
      }),
    [refreshOne],
  );

  const value = useMemo<IssuesState>(
    () => ({ issues: [...byKey.values()], byKey, loaded, reload, refreshOne }),
    [byKey, loaded, reload, refreshOne],
  );
  return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function useIssues(): IssuesState {
  const s = useContext(IssuesContext);
  if (s === null) throw new Error("useIssues outside IssuesProvider");
  return s;
}
