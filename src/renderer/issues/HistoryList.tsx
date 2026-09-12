import { useEffect, useState } from "react";
import type { Issue } from "../../shared/types";
import { displayNameOf, useSession } from "../app/UserContext";
import { formatDateTime } from "./labels";

type Props = { issueKey: string; version: number; onRestore(old: Issue): void };

/** Previous versions of an issue; `version` changes whenever the current record is saved, which reloads the list. */
export function HistoryList({ issueKey, version, onRestore }: Props): React.JSX.Element {
  const { users } = useSession();
  const [items, setItems] = useState<Issue[]>([]);
  useEffect(() => {
    let alive = true;
    void window.api.issues.history(issueKey).then((h) => {
      if (alive) setItems([...h].reverse());
    });
    return () => {
      alive = false;
    };
  }, [issueKey, version]);

  if (items.length === 0) return <p className="muted">履歴はありません</p>;
  return (
    <table className="history">
      <tbody>
        {items.map((h) => (
          <tr key={h.updatedAt}>
            <td>{formatDateTime(h.updatedAt)}</td>
            <td>{displayNameOf(users, h.updatedBy)}</td>
            <td className="history-summary">{h.summary}</td>
            <td>
              <button type="button" onClick={() => onRestore(h)}>
                戻す
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
