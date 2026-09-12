import { useEffect, useState } from "react";
import { formatDateTime } from "../issues/labels";
import { displayNameOf, useSession } from "./UserContext";

interface Props<T extends { updatedAt: string; updatedBy: string }> {
  /** Loads the previous versions, oldest first. */
  load(): Promise<T[]>;
  /** Changes whenever the current record is saved, which reloads the list. */
  version: string | number;
  labelOf(item: T): string;
  onRestore(old: T): void;
}

/** Previous versions of a record, newest first, each with 戻す. Shared by issues and wiki pages. */
export function HistoryTable<T extends { updatedAt: string; updatedBy: string }>({ load, version, labelOf, onRestore }: Props<T>): React.JSX.Element {
  const { users } = useSession();
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    let alive = true;
    void load().then((h) => {
      if (alive) setItems([...h].reverse());
    });
    return () => {
      alive = false;
    };
  }, [load, version]);

  if (items.length === 0) return <p className="text--muted">履歴はありません</p>;
  return (
    <table className="history">
      <tbody>
        {items.map((h) => (
          <tr key={h.updatedAt}>
            <td className="history__cell">{formatDateTime(h.updatedAt)}</td>
            <td className="history__cell">{displayNameOf(users, h.updatedBy)}</td>
            <td className="history__cell history__cell--summary">{labelOf(h)}</td>
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
