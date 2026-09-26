import { useEffect, useRef, useState } from "react";
import type { DueFilter, Project, User } from "../../shared/types";
import { toggleLabel } from "../issues/labels";
import type { SortKey } from "../issues/sortIssues";
import {
  BLOCK_LABEL,
  COLUMN_LABEL,
  DEFAULT_COLUMNS,
  GANTT_MONTHS,
  ISSUES_GROUP_BY,
  ISSUE_COLUMNS,
  SUMMARY_TABLES,
  SUMMARY_TABLE_LABEL,
  type Block,
  type BlockKind,
  type BlockScope,
  type GanttBlock,
  type GanttMonths,
  type IssueColumn,
  type IssuesBlock,
  type IssuesGroupBy,
  type MonthRef,
  type SummaryBlock,
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

interface ScopeState {
  statuses: Set<string>;
  assignee: string;
  category: string;
  labels: string[];
  due: DueFilter;
  keyword: string;
  createdIn: MonthState;
  updatedIn: MonthState;
  keys: string;
}

const scopeStateOf = (b: BlockScope | undefined, statusIds: string[]): ScopeState => ({
  statuses: new Set(b?.statuses ?? statusIds),
  assignee: b?.assignee ?? "",
  category: b?.category ?? "",
  labels: b?.labels ?? [],
  due: b?.due ?? "all",
  keyword: b?.keyword ?? "",
  createdIn: monthStateOf(b?.createdIn),
  updatedIn: monthStateOf(b?.updatedIn),
  keys: (b?.keys ?? []).join(" "),
});

/** Only the fields that differ from "no restriction" go on the block line (see blocks.ts's optional BlockScope fields). */
const buildScope = (s: ScopeState, statusIds: string[]): BlockScope => {
  const scope: BlockScope = {};
  if (s.statuses.size !== statusIds.length) scope.statuses = statusIds.filter((id) => s.statuses.has(id));
  if (s.assignee !== "") scope.assignee = s.assignee;
  if (s.category !== "") scope.category = s.category;
  if (s.labels.length > 0) scope.labels = s.labels;
  if (s.due !== "all") scope.due = s.due;
  if (s.keyword.trim() !== "") scope.keyword = s.keyword.trim();
  const createdIn = monthRefOf(s.createdIn);
  if (createdIn !== undefined) scope.createdIn = createdIn;
  const updatedIn = monthRefOf(s.updatedIn);
  if (updatedIn !== undefined) scope.updatedIn = updatedIn;
  const keys = s.keys.split(/[\s,、]+/).filter((k) => k !== "");
  if (keys.length > 0) scope.keys = keys;
  return scope;
};

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
  { value: "week", label: "今週" },
  { value: "none", label: "期限なし" },
];
// The fixed sort keys, labelled as src/renderer/issues/IssueList.tsx's own column headers.
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
const ISSUES_GROUP_LABEL: Record<IssuesGroupBy, string> = { none: "なし", assignee: "担当者", status: "状態", category: "種別" };

function MonthField({ label, value, onChange }: { label: string; value: MonthState; onChange(v: MonthState): void }): React.JSX.Element {
  return (
    <span className="filter-bar__field">
      {label}
      <select aria-label={label} value={value.choice} onChange={(e) => onChange({ choice: e.target.value as MonthChoice, value: value.value })}>
        <option value="none">すべて</option>
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
  const ref = useRef<HTMLDialogElement>(null);
  const resolved = useRef(false);
  const statusIds = project.statuses.map((s) => s.id);

  const [scope, setScope] = useState<ScopeState>(() => scopeStateOf(initial ?? undefined, statusIds));
  const [columns, setColumns] = useState<Set<IssueColumn>>(() => new Set(initial?.kind === "issues" ? (initial.columns ?? DEFAULT_COLUMNS) : DEFAULT_COLUMNS));
  const [sort, setSort] = useState<SortKey>(() => (initial?.kind === "issues" ? (initial.sort ?? "key") : "key"));
  const [desc, setDesc] = useState(() => (initial?.kind === "issues" ? (initial.desc ?? false) : false));
  const [issuesGroupBy, setIssuesGroupBy] = useState<IssuesGroupBy>(() => (initial?.kind === "issues" ? (initial.groupBy ?? "none") : "none"));
  const [limit, setLimit] = useState(() => (initial?.kind === "issues" && initial.limit !== undefined ? String(initial.limit) : ""));

  const [mode, setMode] = useState<"month" | "now">(() => (initial?.kind === "summary" ? (initial.mode ?? "month") : "month"));
  const [summaryMonth, setSummaryMonth] = useState<MonthState>(() => monthStateOf(initial?.kind === "summary" ? initial.month : undefined));
  const [tables, setTables] = useState<Set<SummaryTable>>(() => new Set(initial?.kind === "summary" ? (initial.tables ?? ["status"]) : ["status"]));

  const [ganttMonth, setGanttMonth] = useState<MonthState>(() => monthStateOf(initial?.kind === "gantt" ? initial.month : undefined));
  const [months, setMonths] = useState<GanttMonths>(() => (initial?.kind === "gantt" ? (initial.months ?? 1) : 1));
  const [ganttGroupBy, setGanttGroupBy] = useState<"none" | "assignee">(() => (initial?.kind === "gantt" ? (initial.groupBy ?? "none") : "none"));
  const [includeUndated, setIncludeUndated] = useState(() => (initial?.kind === "gantt" ? (initial.includeUndated ?? false) : false));

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    dlg.showModal();
    // Escape fires "cancel" then "close" natively with no submit; a confirmed close already set `resolved`.
    const onNativeClose = (): void => {
      if (!resolved.current) onClose(null);
    };
    dlg.addEventListener("close", onNativeClose);
    return () => dlg.removeEventListener("close", onNativeClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = (): void => {
    const base = buildScope(scope, statusIds);
    let block: Block;
    if (kind === "issues") {
      const b: IssuesBlock = { kind, ...base };
      const cols = ISSUE_COLUMNS.filter((c) => columns.has(c));
      if (!sameArray(cols, DEFAULT_COLUMNS)) b.columns = cols;
      if (sort !== "key") b.sort = sort;
      if (desc) b.desc = true;
      if (issuesGroupBy !== "none") b.groupBy = issuesGroupBy;
      const n = Number(limit);
      if (limit.trim() !== "" && Number.isInteger(n) && n > 0) b.limit = n;
      block = b;
    } else if (kind === "summary") {
      const b: SummaryBlock = { kind, ...base };
      if (mode !== "month") b.mode = mode;
      if (mode === "month") {
        const month = monthRefOf(summaryMonth);
        if (month !== undefined) b.month = month;
      }
      const tbls = SUMMARY_TABLES.filter((t) => tables.has(t));
      if (!sameArray(tbls, ["status"])) b.tables = tbls;
      block = b;
    } else {
      const b: GanttBlock = { kind, ...base };
      const month = monthRefOf(ganttMonth);
      if (month !== undefined) b.month = month;
      if (months !== 1) b.months = months;
      if (ganttGroupBy !== "none") b.groupBy = ganttGroupBy;
      if (includeUndated) b.includeUndated = true;
      block = b;
    }
    resolved.current = true;
    onClose(block);
    ref.current?.close();
  };

  const cancel = (): void => {
    resolved.current = true;
    onClose(null);
    ref.current?.close();
  };

  return (
    <dialog ref={ref} className="block-dialog" aria-label={BLOCK_LABEL[kind]}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
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
            </select>
          </label>
          <label className="filter-bar__field">
            種別
            <select value={scope.category} onChange={(e) => setScope({ ...scope, category: e.target.value })}>
              <option value="">すべて</option>
              {project.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <span className="filter-bar__label">ラベル</span>
          <label className="filter-bar__check">
            <input type="checkbox" checked={scope.labels.length === 0} onChange={() => setScope({ ...scope, labels: [] })} />
            すべて
          </label>
          {project.labels.map((l) => (
            <label key={l.name} className="filter-bar__check">
              <input type="checkbox" checked={scope.labels.includes(l.name)} onChange={() => setScope({ ...scope, labels: toggleLabel(scope.labels, l.name) })} />
              {l.name}
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
            <input type="text" value={scope.keys} onChange={(e) => setScope({ ...scope, keys: e.target.value })} />
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
              </select>
            </label>
            <label className="filter-bar__check">
              <input type="checkbox" checked={desc} onChange={(e) => setDesc(e.target.checked)} />
              降順
            </label>
            <label className="filter-bar__field">
              グループ
              <select value={issuesGroupBy} onChange={(e) => setIssuesGroupBy(e.target.value as IssuesGroupBy)}>
                {ISSUES_GROUP_BY.map((g) => (
                  <option key={g} value={g}>
                    {ISSUES_GROUP_LABEL[g]}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-bar__field">
              行数の上限
              <input type="number" min={1} className="block-dialog__number" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </label>
          </fieldset>
        )}

        {kind === "summary" && (
          <fieldset className="settings__fieldset block-dialog__fieldset">
            <legend className="block-dialog__legend">集計する表</legend>
            <span className="filter-bar__label">集計</span>
            <label className="settings__inline">
              <input type="radio" name="summary-mode" checked={mode === "month"} onChange={() => setMode("month")} />
              月次
            </label>
            <label className="settings__inline">
              <input type="radio" name="summary-mode" checked={mode === "now"} onChange={() => setMode("now")} />
              現在
            </label>
            {mode === "month" && <MonthField label="対象月" value={summaryMonth} onChange={setSummaryMonth} />}
            <span className="filter-bar__label">表</span>
            {SUMMARY_TABLES.map((t) => (
              <label key={t} className="filter-bar__check">
                <input type="checkbox" checked={tables.has(t)} onChange={() => setTables(toggleIn(tables, t))} />
                {SUMMARY_TABLE_LABEL[t]}
              </label>
            ))}
          </fieldset>
        )}

        {kind === "gantt" && (
          <fieldset className="settings__fieldset block-dialog__fieldset">
            <legend className="block-dialog__legend">期間とグループ</legend>
            <MonthField label="対象月" value={ganttMonth} onChange={setGanttMonth} />
            <label className="filter-bar__field">
              期間
              <select value={months} onChange={(e) => setMonths(Number(e.target.value) as GanttMonths)}>
                {GANTT_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}か月
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-bar__field">
              グループ
              <select value={ganttGroupBy} onChange={(e) => setGanttGroupBy(e.target.value as "none" | "assignee")}>
                <option value="none">なし</option>
                <option value="assignee">担当者</option>
              </select>
            </label>
            <label className="filter-bar__check">
              <input type="checkbox" checked={includeUndated} onChange={(e) => setIncludeUndated(e.target.checked)} />
              期限なしを含む
            </label>
          </fieldset>
        )}

        <div className="form-actions">
          <button type="submit" className="button--primary">
            {initial ? "本文に反映" : "本文に挿入"}
          </button>
          <button type="button" onClick={cancel}>
            キャンセル
          </button>
        </div>
      </form>
    </dialog>
  );
}
