import { useState } from "react";
import { displayNameOf, useSession } from "../app/SessionContext";
import { errorMessage } from "../messages";

const ADD = "__add__";

type Props = {
  value: string;
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
export function AssigneeSelect({ value, leading, onChange, id, className, ariaLabel }: Props): React.JSX.Element {
  const { users, refreshUsers } = useSession();
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A stored value outside the options (a removed member, a login with no record) gets its own option;
  // without it the select would show its first option, such as 未設定, for an issue that has an assignee.
  const isUnlisted = !leading.some((o) => o.value === value) && !users.some((u) => u.username === value);

  const addMember = async (): Promise<void> => {
    const trimmed = newMemberName.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await window.api.users.add(trimmed); // the store returns the existing member for a name already registered
      await refreshUsers();
      onChange(user.username);
      setNewMemberName("");
      setIsAddingMember(false);
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
          if (e.target.value === ADD) setIsAddingMember(true);
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
        {isUnlisted && <option value={value}>{displayNameOf(users, value)}</option>}
        <option value={ADD}>メンバーを追加…</option>
      </select>
      {isAddingMember && (
        <span className="assignee-add">
          <input
            className="settings__name"
            aria-label="名前"
            value={newMemberName}
            autoFocus
            onChange={(e) => setNewMemberName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addMember();
              }
            }}
          />
          <button type="button" disabled={newMemberName.trim() === "" || busy} onClick={() => void addMember()}>
            追加
          </button>
          <button type="button" onClick={() => setIsAddingMember(false)}>
            キャンセル
          </button>
          {error && <span className="text--error">{error}</span>}
        </span>
      )}
    </>
  );
}
