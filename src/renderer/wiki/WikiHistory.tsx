import { useCallback } from "react";
import type { WikiPage } from "../../shared/types";
import { HistoryTable } from "../app/HistoryTable";

interface Props { pageId: string; version: string; onRestore(old: WikiPage): void }

export function WikiHistory({ pageId, version, onRestore }: Props): React.JSX.Element {
  const load = useCallback(() => window.api.wiki.history(pageId), [pageId]);
  return <HistoryTable load={load} version={version} labelOf={(h) => h.title} onRestore={onRestore} />;
}
