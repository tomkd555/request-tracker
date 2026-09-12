import { useEffect, useState } from "react";
import type { WikiPage } from "../../shared/types";
import { diffHunks, diffLines } from "../app/diffLines";
import { displayNameOf, useSession } from "../app/UserContext";
import { formatDateTime } from "../issues/labels";

interface Props { page: WikiPage; onRestore(old: WikiPage): void }

/**
 * Previous versions newest first. A history entry is the record as it stood before a save, so the note and the diff
 * shown on a row belong to the version that replaced it: the next entry, or the current page for the newest row.
 */
export function WikiHistory({ page, onRestore }: Props): React.JSX.Element {
  const { users } = useSession();
  const [history, setHistory] = useState<WikiPage[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void window.api.wiki.history(page.id).then((h) => {
      if (alive) setHistory(h);
    });
    return () => {
      alive = false;
    };
  }, [page.id, page.updatedAt]);

  if (history.length === 0) return <p className="text--muted">履歴はありません</p>;
  const versions = [...history, page];
  const rows = history.map((old, i) => ({ old, next: versions[i + 1] })).reverse();

  return (
    <table className="history">
      <tbody>
        {rows.map(({ old, next }) => (
          <HistoryRow key={old.updatedAt} old={old} next={next} open={open === old.updatedAt} onToggle={() => setOpen((o) => (o === old.updatedAt ? null : old.updatedAt))} onRestore={() => onRestore(old)} userName={(u) => displayNameOf(users, u)} />
        ))}
      </tbody>
    </table>
  );
}

interface RowProps { old: WikiPage; next: WikiPage; open: boolean; onToggle(): void; onRestore(): void; userName(u: string): string }

function HistoryRow({ old, next, open, onToggle, onRestore, userName }: RowProps): React.JSX.Element {
  const hunks = open ? diffHunks(diffLines(old.body, next.body)) : [];
  return (
    <>
      <tr>
        <td className="history__cell">{formatDateTime(next.updatedAt)}</td>
        <td className="history__cell">{userName(next.updatedBy)}</td>
        <td className="history__cell history__cell--summary">{next.note || (next.title !== old.title ? `タイトル: ${old.title} → ${next.title}` : "")}</td>
        <td className="history__cell">
          <div className="form-actions">
            <button type="button" aria-expanded={open} onClick={onToggle}>
              差分
            </button>
            <button type="button" onClick={onRestore}>
              戻す
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="history__cell">
            {next.title !== old.title && (
              <p className="wiki-diff__title">
                タイトル: {old.title} → {next.title}
              </p>
            )}
            {hunks.length === 0 ? (
              <p className="text--muted">本文に変更はありません</p>
            ) : (
              <pre className="wiki-diff">
                {hunks.map((l, i) =>
                  l === null ? (
                    <span key={i} className="wiki-diff__gap">
                      …{"\n"}
                    </span>
                  ) : (
                    <span key={i} className={`wiki-diff__line wiki-diff__line--${l.kind}`}>
                      {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
                      {l.text}
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
