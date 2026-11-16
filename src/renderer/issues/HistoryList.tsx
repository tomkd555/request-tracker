import { useCallback } from "react";
import type { Issue } from "../../shared/types";
import { HistoryTable } from "../app/HistoryTable";

interface Props { issueKey: string; saveCount: number; onRestore(old: Issue): void }

export function HistoryList({ issueKey, saveCount, onRestore }: Props): React.JSX.Element {
  const load = useCallback(() => window.api.issues.history(issueKey), [issueKey]);
  return <HistoryTable load={load} saveCount={saveCount} labelOf={(h) => h.summary} onRestore={onRestore} />;
}
