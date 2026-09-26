import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Report } from "../../shared/types";

export interface ReportsState {
  reports: Report[];
  byId: Map<string, Report>;
  loaded: boolean;
  reload(): Promise<void>;
  refreshOne(id: string): Promise<void>;
}

export const ReportsContext = createContext<ReportsState | null>(null);

export function ReportsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [byId, setById] = useState<Map<string, Report>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const list = await window.api.reports.list();
    setById(new Map(list.map((r) => [r.id, r])));
    setLoaded(true);
  }, []);

  const refreshOne = useCallback(async (id: string) => {
    const report = await window.api.reports.get(id);
    setById((m) => {
      const next = new Map(m);
      if (report === null) next.delete(id);
      else next.set(id, report);
      return next;
    });
  }, []);

  // No load here: the shell reads the share when a screen opens and on 更新 (see App.tsx).

  const value = useMemo<ReportsState>(() => {
    const reports = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { reports, byId, loaded, reload, refreshOne };
  }, [byId, loaded, reload, refreshOne]);
  return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
}

export function useReports(): ReportsState {
  const s = useContext(ReportsContext);
  if (s === null) throw new Error("useReports outside ReportsProvider");
  return s;
}
