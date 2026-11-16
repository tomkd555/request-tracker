import { useEffect, useState } from "react";
import type { WikiPage } from "../../shared/types";
import { diffHunks, diffLines, type DiffKind } from "../app/diffLines";
import { readHistory } from "../app/HistoryTable";
import { displayNameOf, useSession } from "../app/SessionContext";
import { formatDateTime } from "../issues/labels";
import { M } from "../messages";

const DIFF_PREFIX: Record<DiffKind, string> = { add: "+ ", del: "- ", same: "  " };

interface Props { page: WikiPage; onRestore(old: WikiPage): void }

/**
 * Previous versions newest first. A history entry is the record as it stood before a save, so the note and the diff
 * shown on a row belong to the version that replaced it: the next entry, or the current page for the newest row.
 */
export function WikiHistory({ page, onRestore }: Props): React.JSX.Element | null {
  const { users } = useSession();
  // null until the first read returns, so "no history" shows only for a list that was read and is empty
  const [history, setHistory] = useState<WikiPage[] | null>(null);
  const [expandedStamp, setExpandedStamp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let isCurrent = true;
    void readHistory(() => window.api.wiki.history(page.id)).then((result) => {
      if (!isCurrent) return;
      setHistory(result.items);
      setError(result.error);
    });
    return () => {
      isCurrent = false;
    };
  }, [page.id, page.updatedAt]);

  if (error !== null) return <p className="text--error">{error}</p>;
  if (history === null) return null;
  if (history.length === 0) return <p className="text--muted">{M.noHistory}</p>;
  const versions = [...history, page];
  const rows = history.map((old, i) => ({ old, next: versions[i + 1] })).reverse();

  return (
    <table className="history">
      <tbody>
        {rows.map(({ old, next }) => (
          <HistoryRow
            key={old.updatedAt}
            old={old}
            next={next}
            isExpanded={expandedStamp === old.updatedAt}
            onToggle={() => setExpandedStamp((stamp) => (stamp === old.updatedAt ? null : old.updatedAt))}
            onRestore={() => onRestore(old)}
            nameOf={(u) => displayNameOf(users, u)}
          />
        ))}
      </tbody>
    </table>
  );
}

interface RowProps { old: WikiPage; next: WikiPage; isExpanded: boolean; onToggle(): void; onRestore(): void; nameOf(u: string): string }

function HistoryRow({ old, next, isExpanded, onToggle, onRestore, nameOf }: RowProps): React.JSX.Element {
  const hunks = isExpanded ? diffHunks(diffLines(old.body, next.body)) : [];
  const titleChange = next.title !== old.title ? `タイトル: ${old.title} → ${next.title}` : null;
  return (
    <>
      <tr>
        <td className="history__cell">{formatDateTime(next.updatedAt)}</td>
        <td className="history__cell">{nameOf(next.updatedBy)}</td>
        <td className="history__cell history__cell--summary">{next.note || (titleChange ?? "")}</td>
        <td className="history__cell">
          <div className="form-actions">
            <button type="button" aria-expanded={isExpanded} onClick={onToggle}>
              差分
            </button>
            <button type="button" onClick={onRestore}>
              戻す
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={4} className="history__cell">
            {titleChange !== null && <p className="wiki-diff__title">{titleChange}</p>}
            {hunks.length === 0 ? (
              <p className="text--muted">{M.noBodyChange}</p>
            ) : (
              <pre className="wiki-diff">
                {hunks.map((line, index) =>
                  line === null ? (
                    <span key={index} className="wiki-diff__gap">
                      …{"\n"}
                    </span>
                  ) : (
                    <span key={index} className={`wiki-diff__line wiki-diff__line--${line.kind}`}>
                      {DIFF_PREFIX[line.kind]}
                      {line.text}
                      {"\n"}
                    </span>
                  ),
                )}
              </pre>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
