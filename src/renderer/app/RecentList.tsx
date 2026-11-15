import { useEffect, useMemo, useRef, useState } from "react";
import type { Comment } from "../../shared/types";
import { formatDateTime } from "../issues/labels";
import { useIssues } from "../issues/useIssues";
import { errorMessage, M } from "../messages";
import { useWiki } from "../wiki/useWiki";
import { recentUpdates, type RecentKind } from "./recent";
import { displayNameOf, useSession } from "./UserContext";

const KIND_LABEL: Record<RecentKind, string> = { created: "登録", updated: "更新", comment: "コメント", wiki: "Wiki" };

export function RecentList(): React.JSX.Element {
  const { users } = useSession();
  const { issues } = useIssues();
  const { pages } = useWiki();
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The shell re-reads the issues as the screen opens and on 更新; the comments follow each of those reads, so they are read once per read of the share and never on a timer.
  const atMount = useRef(issues);
  useEffect(() => {
    if (issues === atMount.current) return;
    let current = true;
    window.api.comments
      .listAll()
      .then((list) => {
        if (!current) return;
        setComments(list);
        setError(null);
      })
      .catch((e: unknown) => {
        if (current) setError(errorMessage(e));
      });
    return () => {
      current = false;
    };
  }, [issues]);

  const entries = useMemo(() => recentUpdates(issues, comments, pages), [issues, comments, pages]);

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">最近の更新</h1>
      </header>
      {error && <p className="text--error">{error}</p>}
      {entries.length === 0 && !error ? (
        <p className="text--muted">{M.noRecent}</p>
      ) : (
        <table className="issue-table" aria-label="最近の更新">
          <thead>
            <tr>
              <th className="issue-table__header">日時</th>
              <th className="issue-table__header">メンバー</th>
              <th className="issue-table__header">種別</th>
              <th className="issue-table__header">対象</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={`${e.kind}-${e.id}`} className="issue-table__row">
                <td className="issue-table__cell">{formatDateTime(e.at)}</td>
                <td className="issue-table__cell">{displayNameOf(users, e.by)}</td>
                <td className="issue-table__cell">{KIND_LABEL[e.kind]}</td>
                <td className="issue-table__cell">
                  {e.kind === "wiki" ? (
                    <a href={`#/wiki/${e.id}`}>{e.title}</a>
                  ) : (
                    <a href={`#/issues/${e.key}`}>
                      {e.key} {e.summary}
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
