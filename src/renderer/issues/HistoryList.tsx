import { useCallback } from "react";
import type { Issue } from "../../shared/types";
import { HistoryTable } from "../app/HistoryTable";

interface Props { issueKey: string; version: number; onRestore(old: Issue): void }

export function HistoryList({ issueKey, version, onRestore }: Props): React.JSX.Element {
  const load = useCallback(() => window.api.issues.history(issueKey), [issueKey]);
  return <HistoryTable load={load} version={version} labelOf={(h) => h.summary} onRestore={onRestore} />;
}
