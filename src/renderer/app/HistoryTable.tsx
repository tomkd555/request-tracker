import { useEffect, useState } from "react";
import { formatDateTime } from "../issues/labels";
import { displayNameOf, useSession } from "./UserContext";
import { errorMessage, M } from "../messages";

interface Props<T extends { updatedAt: string; updatedBy: string }> {
  /** Loads the previous versions, oldest first. */
  load(): Promise<T[]>;
  /** Changes whenever the current record is saved, which reloads the list. */
  version: string | number;
  labelOf(item: T): string;
  onRestore(old: T): void;
}

/** The versions a history read returned, or the message to show when the read failed. Shared with the wiki history. */
export async function readHistory<T>(load: () => Promise<T[]>): Promise<{ items: T[]; error: string | null }> {
  try {
    return { items: await load(), error: null };
  } catch (e) {
    return { items: [], error: errorMessage(e) };
  }
}

/** Previous versions of a record, newest first, each with 戻す. Shared by issues and wiki pages. */
export function HistoryTable<T extends { updatedAt: string; updatedBy: string }>({ load, version, labelOf, onRestore }: Props<T>): React.JSX.Element {
  const { users } = useSession();
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void readHistory(load).then((r) => {
      if (!alive) return;
      setItems([...r.items].reverse());
      setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [load, version]);

  if (error !== null) return <p className="text--error">{error}</p>;
  if (items.length === 0) return <p className="text--muted">{M.noHistory}</p>;
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
