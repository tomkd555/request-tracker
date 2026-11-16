import { useEffect, useRef, useState } from "react";
import type { DueFilter, Project, User } from "../../shared/types";
import { categoryOptions, displayNameOf } from "../app/SessionContext";
import { labelOptions, toggleLabel } from "../issues/labels";
import type { SortKey } from "../issues/sortIssues";
import {
  BLOCK_LABEL,
  COLUMN_LABEL,
  DEFAULT_COLUMNS,
  DEFAULT_GANTT_MONTHS,
  DEFAULT_GROUP_BY,
  DEFAULT_MONTH,
  DEFAULT_SORT_KEY,
  DEFAULT_SUMMARY_MODE,
  DEFAULT_SUMMARY_TABLES,
  GANTT_GROUP_BY,
  GANTT_MONTHS,
  ISSUES_GROUP_BY,
  ISSUE_COLUMNS,
  SUMMARY_TABLES,
  SUMMARY_TABLE_LABEL,
  type Block,
  type BlockKind,
  type BlockScope,
  type GanttBlock,
  type GanttGroupBy,
  type GanttMonths,
  type IssueColumn,
  type IssuesBlock,
  type IssuesGroupBy,
  type MonthRef,
  type SummaryBlock,
  type SummaryMode,
  type SummaryTable,
} from "./blocks";

interface Props {
  kind: BlockKind;
  initial: Block | null;
  project: Project;
  users: User[];
  onClose(block: Block | null): void;
}

type MonthChoice = "none" | "current" | "previous" | "month";
interface MonthState { choice: MonthChoice; value: string }

const monthStateOf = (v: MonthRef | undefined): MonthState =>
  v === undefined ? { choice: "none", value: "" } : v === "current" || v === "previous" ? { choice: v, value: "" } : { choice: "month", value: v };
const monthRefOf = (m: MonthState): MonthRef | undefined => (m.choice === "none" ? undefined : m.choice === "month" ? m.value || undefined : m.choice);
/** The 対象月 to write: left off while it is the default and the block had none, so an untouched line stays as it was. */
const targetMonthOf = (m: MonthState, initialRef: MonthRef | undefined): MonthRef | undefined => {
  const ref = monthRefOf(m);
  return ref === DEFAULT_MONTH && initialRef === undefined ? undefined : ref;
};

interface ScopeState {
  statuses: Set<string>;
  assignee: string;
  category: string;
  milestone: string;
  labels: string[];
  due: DueFilter;
  keyword: string;
  createdIn: MonthState;
  updatedIn: MonthState;
  keysText: string;
}

export const scopeStateOf = (scope: BlockScope | undefined, statusIds: string[]): ScopeState => ({
  statuses: new Set(scope?.statuses ?? statusIds),
  assignee: scope?.assignee ?? "",
  category: scope?.category ?? "",
  milestone: scope?.milestone ?? "",
  labels: scope?.labels ?? [],
  due: scope?.due ?? "all",
  keyword: scope?.keyword ?? "",
  createdIn: monthStateOf(scope?.createdIn),
  updatedIn: monthStateOf(scope?.updatedIn),
  keysText: (scope?.keys ?? []).join(" "),
});

/** Only the fields that differ from "no restriction" go on the block line (see blocks.ts's optional BlockScope fields). */
export const buildScope = (state: ScopeState, statusIds: string[]): BlockScope => {
  const scope: BlockScope = {};
  const chosen = statusIds.filter((id) => state.statuses.has(id)); // a stage deleted since the block was written is dropped here
  if (chosen.length !== statusIds.length) scope.statuses = chosen;
  if (state.assignee !== "") scope.assignee = state.assignee;
  if (state.category !== "") scope.category = state.category;
  if (state.milestone !== "") scope.milestone = state.milestone;
  if (state.labels.length > 0) scope.labels = state.labels;
  if (state.due !== "all") scope.due = state.due;
  if (state.keyword.trim() !== "") scope.keyword = state.keyword.trim();
  const createdIn = monthRefOf(state.createdIn);
  if (createdIn !== undefined) scope.createdIn = createdIn;
  const updatedIn = monthRefOf(state.updatedIn);
  if (updatedIn !== undefined) scope.updatedIn = updatedIn;
  const keys = state.keysText.split(/[\s,、]+/).filter((k) => k !== "");
  if (keys.length > 0) scope.keys = keys;
  return scope;
};

/** A table with no column prints nothing, and a summary with no table prints its month label alone: an `::issues` block needs a column, a `::summary` block a table. */
export function canInsertBlock(kind: BlockKind, columnCount: number, tableCount: number): boolean {
  if (kind === "issues") return columnCount > 0;
  if (kind === "summary") return tableCount > 0;
  return true;
}

const toggleIn = <T,>(set: Set<T>, v: T): Set<T> => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};
const sameArray = <T,>(a: T[], b: T[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "overdue", label: "期限超過" },
  { value: "week", label: "7日以内" },
  { value: "none", label: "期限なし" },
];
// The fixed column headers of src/renderer/issues/IssueList.tsx with their labels. マイルストーン and 汎用列 keys are
// left out; a block line that names one keeps it and shows it as an extra option.
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "key", label: "キー" },
  { key: "summary", label: "件名" },
  { key: "category", label: "種別" },
  { key: "assignee", label: "担当者" },
  { key: "status", label: "状態" },
  { key: "priority", label: "優先度" },
  { key: "dueDate", label: "期限日" },
  { key: "updatedAt", label: "更新日" },
];
const GROUP_BY_LABEL: Record<IssuesGroupBy, string> = { none: "なし", assignee: "担当者", status: "状態", category: "種別" };

function MonthField({ label, value, hasAllOption = true, onChange }: { label: string; value: MonthState; hasAllOption?: boolean; onChange(v: MonthState): void }): React.JSX.Element {
  return (
    <span className="filter-bar__field">
      {label}
      <select aria-label={label} value={value.choice} onChange={(e) => onChange({ choice: e.target.value as MonthChoice, value: value.value })}>
        {hasAllOption && <option value="none">すべて</option>}
        <option value="current">今月</option>
        <option value="previous">先月</option>
        <option value="month">指定月</option>
      </select>
      {value.choice === "month" && (
        <input type="month" aria-label={`${label} 指定月`} value={value.value} onChange={(e) => onChange({ choice: "month", value: e.target.value })} />
      )}
    </span>
  );
}

/** One block's fields in a native modal; the caller mounts a fresh instance per open, so `initial` only ever applies at mount. */
export function BlockDialog({ kind, initial, project, users, onClose }: Props): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isResolved = useRef(false);
  const statusIds = project.statuses.map((s) => s.id);
  const issuesInit = initial?.kind === "issues" ? initial : undefined;
  const summaryInit = initial?.kind === "summary" ? initial : undefined;
  const ganttInit = initial?.kind === "gantt" ? initial : undefined;

  const [scope, setScope] = useState<ScopeState>(() => scopeStateOf(initial ?? undefined, statusIds));
  const [columns, setColumns] = useState<Set<IssueColumn>>(() => new Set(issuesInit?.columns ?? DEFAULT_COLUMNS));
  const [sort, setSort] = useState<SortKey>(() => issuesInit?.sort ?? DEFAULT_SORT_KEY);
  const [isDescending, setIsDescending] = useState(() => issuesInit?.desc ?? false);
  const [issuesGroupBy, setIssuesGroupBy] = useState<IssuesGroupBy>(() => issuesInit?.groupBy ?? DEFAULT_GROUP_BY);
  const [limitText, setLimitText] = useState(() => (issuesInit?.limit === undefined ? "" : String(issuesInit.limit)));

  const [summaryMode, setSummaryMode] = useState<SummaryMode>(() => summaryInit?.mode ?? DEFAULT_SUMMARY_MODE);
  const [summaryMonth, setSummaryMonth] = useState<MonthState>(() => monthStateOf(summaryInit?.month ?? DEFAULT_MONTH));
  const [summaryTables, setSummaryTables] = useState<Set<SummaryTable>>(() => new Set(summaryInit?.tables ?? DEFAULT_SUMMARY_TABLES));

  const [ganttMonth, setGanttMonth] = useState<MonthState>(() => monthStateOf(ganttInit?.month ?? DEFAULT_MONTH));
  const [monthCount, setMonthCount] = useState<GanttMonths>(() => ganttInit?.months ?? DEFAULT_GANTT_MONTHS);
  const [ganttGroupBy, setGanttGroupBy] = useState<GanttGroupBy>(() => ganttInit?.groupBy ?? DEFAULT_GROUP_BY);
  const [includeUndated, setIncludeUndated] = useState(() => ganttInit?.includeUndated ?? false);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    dlg.showModal();
    // Escape fires "cancel" then "close" natively with no submit; a confirmed close already set `isResolved`.
    const onNativeClose = (): void => {
      if (!isResolved.current) onClose(null);
    };
    dlg.addEventListener("close", onNativeClose);
    return () => dlg.removeEventListener("close", onNativeClose);
    // Runs once at mount: the caller mounts a fresh dialog per open, so the mount-time `onClose` is the current one.
  }, []);

  const finish = (block: Block | null): void => {
    isResolved.current = true;
    onClose(block);
    dialogRef.current?.close();
  };

  const submitBlock = (): void => {
    if (!canInsertBlock(kind, columns.size, summaryTables.size)) return;
    const base = buildScope(scope, statusIds);
    let block: Block;
    if (kind === "issues") {
      const issuesBlock: IssuesBlock = { kind, ...base };
      const columnList = ISSUE_COLUMNS.filter((c) => columns.has(c));
      if (!sameArray(columnList, DEFAULT_COLUMNS)) issuesBlock.columns = columnList;
      if (sort !== DEFAULT_SORT_KEY) issuesBlock.sort = sort;
      if (isDescending) issuesBlock.desc = true;
      if (issuesGroupBy !== DEFAULT_GROUP_BY) issuesBlock.groupBy = issuesGroupBy;
      const limitValue = Number(limitText);
      if (limitText.trim() !== "" && Number.isInteger(limitValue) && limitValue > 0) issuesBlock.limit = limitValue;
      block = issuesBlock;
    } else if (kind === "summary") {
      const summaryBlock: SummaryBlock = { kind, ...base };
      if (summaryMode !== DEFAULT_SUMMARY_MODE) summaryBlock.mode = summaryMode;
      if (summaryMode === "month") {
        const month = targetMonthOf(summaryMonth, summaryInit?.month);
        if (month !== undefined) summaryBlock.month = month;
      }
      const tableList = SUMMARY_TABLES.filter((t) => summaryTables.has(t));
      if (!sameArray(tableList, DEFAULT_SUMMARY_TABLES)) summaryBlock.tables = tableList;
      block = summaryBlock;
    } else {
      const ganttBlock: GanttBlock = { kind, ...base };
      const month = targetMonthOf(ganttMonth, ganttInit?.month);
      if (month !== undefined) ganttBlock.month = month;
      if (monthCount !== DEFAULT_GANTT_MONTHS) ganttBlock.months = monthCount;
      if (ganttGroupBy !== DEFAULT_GROUP_BY) ganttBlock.groupBy = ganttGroupBy;
      if (includeUndated) ganttBlock.includeUndated = true;
      block = ganttBlock;
    }
    finish(block);
  };

  // A value the block names that the project no longer lists keeps an option of its own, so the select shows what the line holds.
  const isUnlistedAssignee = scope.assignee !== "" && !users.some((u) => u.username === scope.assignee);
  const milestones = project.milestones ?? [];
  const isUnlistedMilestone = scope.milestone !== "" && !milestones.some((m) => m.id === scope.milestone);
  const isUnlistedSort = !SORT_OPTIONS.some((o) => o.key === sort);

  return (
    <dialog ref={dialogRef} className="block-dialog" aria-label={BLOCK_LABEL[kind]}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          submitBlock();
        }}
      >
        <h2>{BLOCK_LABEL[kind]}</h2>
        <fieldset className="settings__fieldset block-dialog__fieldset">
          <legend className="block-dialog__legend">対象の課題</legend>
          <span className="filter-bar__label">状態</span>
          {project.statuses.map((s) => (
            <label key={s.id} className="filter-bar__check">
              <input type="checkbox" checked={scope.statuses.has(s.id)} onChange={() => setScope({ ...scope, statuses: toggleIn(scope.statuses, s.id) })} />
              {s.name}
            </label>
          ))}
          <label className="filter-bar__field">
            担当者
            <select value={scope.assignee} onChange={(e) => setScope({ ...scope, assignee: e.target.value })}>
              <option value="">すべて</option>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.displayName}
                </option>
              ))}
              {isUnlistedAssignee && <option value={scope.assignee}>{displayNameOf(users, scope.assignee)}</option>}
            </select>
          </label>
          <label className="filter-bar__field">
            種別
            <select value={scope.category} onChange={(e) => setScope({ ...scope, category: e.target.value })}>
              <option value="">すべて</option>
              {categoryOptions(project, scope.category).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {(milestones.length > 0 || scope.milestone !== "") && (
            <label className="filter-bar__field">
              マイルストーン
              <select value={scope.milestone} onChange={(e) => setScope({ ...scope, milestone: e.target.value })}>
                <option value="">すべて</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                {isUnlistedMilestone && <option value={scope.milestone}>{scope.milestone}</option>}
              </select>
            </label>
          )}
          <span className="filter-bar__label">ラベル</span>
          <label className="filter-bar__check">
            <input type="checkbox" checked={scope.labels.length === 0} onChange={() => setScope({ ...scope, labels: [] })} />
            すべて
          </label>
          {labelOptions(project, scope.labels).map((name) => (
            <label key={name} className="filter-bar__check">
              <input type="checkbox" checked={scope.labels.includes(name)} onChange={() => setScope({ ...scope, labels: toggleLabel(scope.labels, name) })} />
              {name}
            </label>
          ))}
          <label className="filter-bar__field">
            期限日
            <select value={scope.due} onChange={(e) => setScope({ ...scope, due: e.target.value as DueFilter })}>
              {DUE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-bar__field">
            キーワード
            <input type="search" value={scope.keyword} onChange={(e) => setScope({ ...scope, keyword: e.target.value })} />
          </label>
          <MonthField label="登録月" value={scope.createdIn} onChange={(v) => setScope({ ...scope, createdIn: v })} />
          <MonthField label="更新月" value={scope.updatedIn} onChange={(v) => setScope({ ...scope, updatedIn: v })} />
          <label className="filter-bar__field">
            キー
            <input type="text" value={scope.keysText} onChange={(e) => setScope({ ...scope, keysText: e.target.value })} />
            <span className="block-dialog__format">複数は空白で区切る</span>
          </label>
        </fieldset>

        {kind === "issues" && (
          <fieldset className="settings__fieldset block-dialog__fieldset">
            <legend className="block-dialog__legend">表の列と並び順</legend>
            <span className="filter-bar__label">列</span>
            {ISSUE_COLUMNS.map((c) => (
              <label key={c} className="filter-bar__check">
                <input type="checkbox" checked={columns.has(c)} onChange={() => setColumns(toggleIn(columns, c))} />
                {COLUMN_LABEL[c]}
              </label>
            ))}
            <label className="filter-bar__field">
              並び順
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
                {isUnlistedSort && <option value={sort}>{sort}</option>}
              </select>
            </label>
            <label className="filter-bar__check">
              <input type="checkbox" checked={isDescending} onChange={(e) => setIsDescending(e.target.checked)} />
              降順
            </label>
            <label className="filter-bar__field">
              グループ
              <select value={issuesGroupBy} onChange={(e) => setIssuesGroupBy(e.target.value as IssuesGroupBy)}>
                {ISSUES_GROUP_BY.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_BY_LABEL[g]}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-bar__field">
              行数の上限
              <input type="number" min={1} className="block-dialog__number" value={limitText} onChange={(e) => setLimitText(e.target.value)} />
            </label>
          </fieldset>
        )}

        {kind === "summary" && (
          <fieldset className="settings__fieldset block-dialog__fieldset">
            <legend className="block-dialog__legend">集計する表</legend>
            <span className="filter-bar__label">集計</span>
            <label className="settings__inline">
              <input type="radio" name="summary-mode" checked={summaryMode === "month"} onChange={() => setSummaryMode("month")} />
              月次
            </label>
            <label className="settings__inline">
              <input type="radio" name="summary-mode" checked={summaryMode === "now"} onChange={() => setSummaryMode("now")} />
              現在
            </label>
            {summaryMode === "month" && <MonthField label="対象月" value={summaryMonth} hasAllOption={false} onChange={setSummaryMonth} />}
            <span className="filter-bar__label">表</span>
            {SUMMARY_TABLES.map((t) => (
              <label key={t} className="filter-bar__check">
                <input type="checkbox" checked={summaryTables.has(t)} onChange={() => setSummaryTables(toggleIn(summaryTables, t))} />
                {SUMMARY_TABLE_LABEL[t]}
              </label>
            ))}
          </fieldset>
        )}

        {kind === "gantt" && (
          <fieldset className="settings__fieldset block-dialog__fieldset">
            <legend className="block-dialog__legend">期間とグループ</legend>
            <MonthField label="対象月" value={ganttMonth} hasAllOption={false} onChange={setGanttMonth} />
            <label className="filter-bar__field">
              期間
              <select value={monthCount} onChange={(e) => setMonthCount(Number(e.target.value) as GanttMonths)}>
                {GANTT_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}か月
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-bar__field">
              グループ
              <select value={ganttGroupBy} onChange={(e) => setGanttGroupBy(e.target.value as GanttGroupBy)}>
                {GANTT_GROUP_BY.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_BY_LABEL[g]}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-bar__check">
              <input type="checkbox" checked={includeUndated} onChange={(e) => setIncludeUndated(e.target.checked)} />
              期限なしを含む
            </label>
          </fieldset>
        )}

        <div className="form-actions">
          <button type="submit" className="button--primary" disabled={!canInsertBlock(kind, columns.size, summaryTables.size)}>
            {initial ? "本文に反映" : "本文に挿入"}
          </button>
          <button type="button" onClick={() => finish(null)}>
            キャンセル
          </button>
        </div>
      </form>
    </dialog>
  );
}
