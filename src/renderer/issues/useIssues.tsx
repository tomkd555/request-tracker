import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Issue } from "../../shared/types";
import { useSession } from "../app/UserContext";
import { withKnownStatus } from "./labels";

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
  const { statuses } = useSession().project;
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

  // No load here: the shell reads the share when a screen opens and on 更新 (see App.tsx).

  // An issue on a stage the project no longer lists reads as the first stage everywhere; its file changes on its next save.
  const value = useMemo<IssuesState>(() => {
    const issues = withKnownStatus([...byKey.values()], statuses);
    return { issues, byKey: new Map(issues.map((i) => [i.key, i])), loaded, reload, refreshOne };
  }, [byKey, statuses, loaded, reload, refreshOne]);
  return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function useIssues(): IssuesState {
  const s = useContext(IssuesContext);
  if (s === null) throw new Error("useIssues outside IssuesProvider");
  return s;
}
