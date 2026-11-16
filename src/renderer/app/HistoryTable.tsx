import { useEffect, useState } from "react";
import { formatDateTime } from "../issues/labels";
import { displayNameOf, useSession } from "./SessionContext";
import { errorMessage, M } from "../messages";

type Versioned = { updatedAt: string; updatedBy: string };

interface Props<T extends Versioned> {
  /** Loads the previous versions, oldest first. */
  load(): Promise<T[]>;
  /** Changes whenever the current record is saved, which reloads the list. */
  saveCount: number;
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

/** Previous versions of an issue, newest first, each with 戻す. Nothing shows until the first read returns. */
export function HistoryTable<T extends Versioned>({ load, saveCount, labelOf, onRestore }: Props<T>): React.JSX.Element | null {
  const { users } = useSession();
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let isCurrent = true;
    void readHistory(load).then((r) => {
      if (!isCurrent) return;
      setItems([...r.items].reverse());
      setError(r.error);
    });
    return () => {
      isCurrent = false;
    };
  }, [load, saveCount]);

  if (error !== null) return <p className="text--error">{error}</p>;
  if (items === null) return null;
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
