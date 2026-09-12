import { ISSUE_STATUSES, type IssueStatus, type User } from "../../shared/types";
import { DEFAULT_FILTER, type IssueFilter } from "./filterIssues";
import { STATUS_LABEL } from "./labels";

type Props = { filter: IssueFilter; users: User[]; onChange(f: IssueFilter): void };

export function FilterBar({ filter, users, onChange }: Props): React.JSX.Element {
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
