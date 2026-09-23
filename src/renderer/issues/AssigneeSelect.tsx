import { useState } from "react";
import type { User } from "../../shared/types";
import { useSession } from "../app/UserContext";
import { errorMessage } from "../messages";

const ADD = "__add__";

type Props = {
  value: string;
  users: User[];
  /** Options before the members, such as 未設定 or 変更しない. */
  leading: { value: string; label: string }[];
  onChange(v: string): void;
  id?: string;
  className?: string;
  ariaLabel?: string;
};

/**
 * The 担当者 chooser: registered members only, because the username is matched exactly by 自分の担当, 確認して完了 and member removal.
 * The last option registers a member on the spot, so nobody has to leave the form for プロジェクト設定.
 */
export function AssigneeSelect({ value, users, leading, onChange, id, className, ariaLabel }: Props): React.JSX.Element {
  const { refreshUsers } = useSession();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await window.api.users.add(trimmed); // the store returns the existing member for a name already registered
      await refreshUsers();
      onChange(user.username);
      setName("");
      setAdding(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <select
        id={id}
        className={className}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD) setAdding(true);
          else onChange(e.target.value);
        }}
      >
        {leading.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {users.map((u) => (
          <option key={u.username} value={u.username}>
            {u.displayName}
          </option>
        ))}
        <option value={ADD}>メンバーを追加…</option>
      </select>
      {adding && (
        <span className="assignee-add">
          <input
            className="settings__name"
            aria-label="名前"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          <button type="button" disabled={name.trim() === "" || busy} onClick={() => void add()}>
            追加
          </button>
          <button type="button" onClick={() => setAdding(false)}>
            キャンセル
          </button>
          {error && <span className="text--error">{error}</span>}
        </span>
      )}
    </>
  );
}
