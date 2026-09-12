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

  if (items.length === 0) return <p className="text--muted">履歴はありません</p>;
  return (
    <table className="history">
      <tbody>
        {items.map((h) => (
          <tr key={h.updatedAt}>
            <td className="history__cell">{formatDateTime(h.updatedAt)}</td>
            <td className="history__cell">{displayNameOf(users, h.updatedBy)}</td>
            <td className="history__cell history__cell--summary">{h.title}</td>
            <td className="history__cell">
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
