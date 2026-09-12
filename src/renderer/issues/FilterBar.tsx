import { ISSUE_STATUSES, type IssueStatus, type User } from "../../shared/types";
import { useSession } from "../app/UserContext";
import { DEFAULT_FILTER, type DueFilter, type IssueFilter } from "./filterIssues";
import { STATUS_LABEL } from "./labels";

type Props = { filter: IssueFilter; users: User[]; onChange(f: IssueFilter): void };

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "overdue", label: "期限超過" },
  { value: "week", label: "7 日以内" },
  { value: "none", label: "期限なし" },
];

export function FilterBar({ filter, users, onChange }: Props): React.JSX.Element {
  const { me } = useSession();
  const toggleStatus = (s: IssueStatus): void => {
    const statuses = filter.statuses.includes(s) ? filter.statuses.filter((x) => x !== s) : [...filter.statuses, s];
    onChange({ ...filter, statuses });
  };
  const userSelect = (value: string | null, set: (v: string | null) => void): React.JSX.Element => (
    <select value={value ?? ""} onChange={(e) => set(e.target.value || null)}>
      <option value="">すべて</option>
      {users.map((u) => (
        <option key={u.username} value={u.username}>
          {u.displayName}
        </option>
      ))}
    </select>
  );
  const mine = (field: "assignee" | "reporter", label: string): React.JSX.Element => {
    const on = filter[field] === me.username;
    return (
      <button
        type="button"
        className={`filter-bar__toggle${on ? " filter-bar__toggle--on" : ""}`}
        aria-pressed={on}
        onClick={() => onChange({ ...filter, [field]: on ? null : me.username })}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="filter-bar">
      <span className="filter-bar__label">状態</span>
      {ISSUE_STATUSES.map((s) => (
        <label key={s} className="filter-bar__check">
          <input type="checkbox" checked={filter.statuses.includes(s)} onChange={() => toggleStatus(s)} />
          {STATUS_LABEL[s]}
        </label>
      ))}
      <label className="filter-bar__field">
        担当者
        {userSelect(filter.assignee, (v) => onChange({ ...filter, assignee: v }))}
      </label>
      <label className="filter-bar__field">
        登録者
        {userSelect(filter.reporter, (v) => onChange({ ...filter, reporter: v }))}
      </label>
      <label className="filter-bar__field">
        期限
        <select value={filter.due} onChange={(e) => onChange({ ...filter, due: e.target.value as DueFilter })}>
          {DUE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {mine("assignee", "自分の担当")}
      {mine("reporter", "自分が登録")}
      <button
        type="button"
        className={`filter-bar__toggle${filter.awaitingConfirmation ? " filter-bar__toggle--on" : ""}`}
        aria-pressed={filter.awaitingConfirmation}
        onClick={() => onChange({ ...filter, awaitingConfirmation: !filter.awaitingConfirmation })}
      >
        確認待ち
      </button>
      <input
        type="search"
        className="filter-bar__search"
        placeholder="キーワード"
        aria-label="キーワード"
        value={filter.keyword}
        onChange={(e) => onChange({ ...filter, keyword: e.target.value })}
      />
      <button type="button" onClick={() => onChange(DEFAULT_FILTER)}>
        クリア
      </button>
    </div>
  );
}
