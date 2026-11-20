import type { DueFilter, IssueFilter, IssueStatus } from "../../shared/types";
import { categoryOptions, displayNameOf, useSession } from "../app/SessionContext";
import { defaultFilter } from "./filterIssues";
import { LabelPicker } from "./LabelPicker";

// A select cannot hold null, so the two conditions that are not a milestone id take these values.
const ALL_MILESTONES = "__all__";
const NO_MILESTONE = "__none__";

function milestoneToOption(milestone: string | null | undefined): string {
  if (milestone == null) return ALL_MILESTONES;
  if (milestone === "") return NO_MILESTONE;
  return milestone;
}

function optionToMilestone(option: string): string | null {
  if (option === ALL_MILESTONES) return null;
  if (option === NO_MILESTONE) return "";
  return option;
}

type Props = { filter: IssueFilter; onChange(f: IssueFilter): void };

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "overdue", label: "期限超過" },
  { value: "week", label: "7日以内" },
  { value: "none", label: "期限なし" },
];

export function FilterBar({ filter, onChange }: Props): React.JSX.Element {
  const { me, users, project } = useSession();
  const milestones = project.milestones ?? [];
  const toggleStatus = (s: IssueStatus): void => {
    const statuses = filter.statuses.includes(s) ? filter.statuses.filter((x) => x !== s) : [...filter.statuses, s];
    onChange({ ...filter, statuses });
  };
  const renderUserSelect = (value: string | null, onSelect: (v: string | null) => void): React.JSX.Element => (
    <select value={value ?? ""} onChange={(e) => onSelect(e.target.value || null)}>
      <option value="">すべて</option>
      {users.map((u) => (
        <option key={u.username} value={u.username}>
          {u.displayName}
        </option>
      ))}
      {/* A saved filter can name a member who was removed; without its own option the select would show すべて while the list stays filtered. */}
      {value !== null && !users.some((u) => u.username === value) && <option value={value}>{displayNameOf(users, value)}</option>}
    </select>
  );
  const renderMineToggle = (field: "assignee" | "reporter", label: string): React.JSX.Element => {
    const isOn = filter[field] === me.username;
    return (
      <button
        type="button"
        className={`filter-bar__toggle${isOn ? " filter-bar__toggle--on" : ""}`}
        aria-pressed={isOn}
        onClick={() => onChange({ ...filter, [field]: isOn ? null : me.username })}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="filter-bar">
      <span className="filter-bar__label">状態</span>
      {project.statuses.map((s) => (
        <label key={s.id} className="filter-bar__check">
          <input type="checkbox" checked={filter.statuses.includes(s.id)} onChange={() => toggleStatus(s.id)} />
          {s.name}
        </label>
      ))}
      <label className="filter-bar__field">
        担当者
        {renderUserSelect(filter.assignee, (v) => onChange({ ...filter, assignee: v }))}
      </label>
      <label className="filter-bar__field">
        登録者
        {renderUserSelect(filter.reporter, (v) => onChange({ ...filter, reporter: v }))}
      </label>
      <label className="filter-bar__field">
        種別
        <select value={filter.category ?? ""} onChange={(e) => onChange({ ...filter, category: e.target.value || null })}>
          <option value="">すべて</option>
          {categoryOptions(project, filter.category ?? "").map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="filter-bar__field">
        ラベル
        <LabelPicker project={project} value={filter.labels} emptyLabel="すべて" onChange={(labels) => onChange({ ...filter, labels })} />
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
      {milestones.length > 0 && (
        <label className="filter-bar__field">
          マイルストーン
          <select value={milestoneToOption(filter.milestone)} onChange={(e) => onChange({ ...filter, milestone: optionToMilestone(e.target.value) })}>
            <option value={ALL_MILESTONES}>すべて</option>
            <option value={NO_MILESTONE}>未設定</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {project.fields
        .filter((f) => f.options.length > 0)
        .map((f) => (
          <label key={f.id} className="filter-bar__field">
            {f.name}
            <select
              value={filter.fields[f.id] ?? ""}
              onChange={(e) => {
                const { [f.id]: _cleared, ...rest } = filter.fields;
                onChange({ ...filter, fields: e.target.value === "" ? rest : { ...rest, [f.id]: e.target.value } });
              }}
            >
              <option value="">すべて</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
      {renderMineToggle("assignee", "自分の担当")}
      {renderMineToggle("reporter", "自分が登録")}
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
      <button type="button" onClick={() => onChange(defaultFilter(project.statuses))}>
        クリア
      </button>
    </div>
  );
}
