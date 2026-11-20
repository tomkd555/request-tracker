import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { Report } from "../../shared/types";

interface ReportsState {
  reports: Report[];
  byId: Map<string, Report>;
  isLoaded: boolean;
  reload(): Promise<void>;
  refreshOne(id: string): Promise<void>;
}

const ReportsContext = createContext<ReportsState | null>(null);

export function ReportsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [byId, setById] = useState<Map<string, Report>>(() => new Map());
  const [isLoaded, setIsLoaded] = useState(false);

  const refreshCount = useRef(0); // bumped by every refreshOne

  const reload = useCallback(async () => {
    for (;;) {
      const refreshesAtStart = refreshCount.current;
      const list = await window.api.reports.list();
      // A list read that began before a save's own re-read holds the report as it was before the save, and would put it back: read again.
      if (refreshCount.current !== refreshesAtStart) continue;
      setById(new Map(list.map((r) => [r.id, r])));
      setIsLoaded(true);
      return;
    }
  }, []);

  const refreshOne = useCallback(async (id: string) => {
    const report = await window.api.reports.get(id);
    refreshCount.current++;
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
    return { reports, byId, isLoaded, reload, refreshOne };
  }, [byId, isLoaded, reload, refreshOne]);
  return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
}

export function useReports(): ReportsState {
  const s = useContext(ReportsContext);
  if (s === null) throw new Error("useReports outside ReportsProvider");
  return s;
}
