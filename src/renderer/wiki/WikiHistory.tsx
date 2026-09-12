import { useEffect, useState } from "react";
import type { WikiPage } from "../../shared/types";
import { displayNameOf, useSession } from "../app/UserContext";
import { formatDateTime } from "../issues/labels";

type Props = { pageId: string; version: string; onRestore(old: WikiPage): void };

/** Previous versions of a page; `version` is the current updatedAt, so a save reloads the list. */
export function WikiHistory({ pageId, version, onRestore }: Props): React.JSX.Element {
  const { users } = useSession();
  const [items, setItems] = useState<WikiPage[]>([]);
  useEffect(() => {
    let alive = true;
    void window.api.wiki.history(pageId).then((h) => {
      if (alive) setItems([...h].reverse());
    });
    return () => {
      alive = false;
    };
  }, [pageId, version]);

  if (items.length === 0) return <p className="muted">履歴はありません</p>;
  return (
    <table className="history">
      <tbody>
        {items.map((h) => (
          <tr key={h.updatedAt}>
            <td>{formatDateTime(h.updatedAt)}</td>
            <td>{displayNameOf(users, h.updatedBy)}</td>
            <td className="history-summary">{h.title}</td>
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
