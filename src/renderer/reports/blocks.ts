// The block lines of a report: their grammar, the parser, and the issues each block covers. Pure, so the screens and the
// exporters read one definition.
import type { DueFilter, Issue, IssueFilter, Project, Report, User } from "../../shared/types";
import { shiftMonth } from "../gantt/layoutGantt";
import { monthOf } from "../issues/countByMonth";
import { filterIssues } from "../issues/filterIssues";
import { FIXED_SORT_KEYS, type SortKey } from "../issues/sortIssues";
import { displayNameOf } from "../app/UserContext";

/** What a report renders against: the records as read when the screen opened, and the day the report is made. */
export interface ReportContext {
  issues: Issue[];
  users: User[];
  project: Project;
  me: User;
  today: string; // YYYY-MM-DD
}

/** What the block renderers and the exporters read of a report; the editor's preview passes its draft as one. */
export type ReportContent = Pick<Report, "title" | "body" | "terms" | "issueNotes">;

/** "current" and "previous" follow `today`, so a saved report shows the month it is opened in; "YYYY-MM" is fixed. */
export type MonthRef = "current" | "previous" | string;

/** Which issues a block covers. A field left out restricts nothing. */
export interface BlockScope {
  /** These issues alone; the other conditions still apply. */
  keys?: string[];
  /** Stage ids. */
  statuses?: string[];
  /** A username. */
  assignee?: string;
  category?: string;
  /** Any of these ラベル names. */
  labels?: string[];
  due?: DueFilter;
  keyword?: string;
  /** Created in the month. */
  createdIn?: MonthRef;
  /** Last updated in the month. */
  updatedIn?: MonthRef;
}

export type IssueColumn = "key" | "summary" | "category" | "labels" | "assignee" | "status" | "priority" | "startDate" | "dueDate" | "updatedAt" | "reporter" | "createdAt" | "note";
/** Every column, in the order the picker and the table show them; `note` is the report's own 補足 (Report.issueNotes). */
export const ISSUE_COLUMNS: IssueColumn[] = ["key", "summary", "category", "labels", "assignee", "status", "priority", "startDate", "dueDate", "updatedAt", "reporter", "createdAt", "note"];
export const COLUMN_LABEL: Record<IssueColumn, string> = {
  key: "キー",
  summary: "件名",
  category: "種別",
  labels: "ラベル",
  assignee: "担当者",
  status: "状態",
  priority: "優先度",
  startDate: "開始日",
  dueDate: "期限日",
  updatedAt: "更新日",
  reporter: "登録者",
  createdAt: "登録日",
  note: "補足",
};
export const DEFAULT_COLUMNS: IssueColumn[] = ["key", "summary", "assignee", "status", "dueDate"];

export type IssuesGroupBy = "none" | "assignee" | "status" | "category";
export const ISSUES_GROUP_BY: IssuesGroupBy[] = ["none", "assignee", "status", "category"];

/** A table of the issues in scope. */
export interface IssuesBlock extends BlockScope {
  kind: "issues";
  columns?: IssueColumn[]; // default DEFAULT_COLUMNS
  sort?: SortKey; // default "key"
  desc?: boolean; // default false
  groupBy?: IssuesGroupBy; // default "none"
  limit?: number; // rows kept after sorting; default every row
}

export type SummaryTable = "status" | "assignee" | "category" | "reporter" | "closed";
export const SUMMARY_TABLES: SummaryTable[] = ["status", "assignee", "category", "reporter", "closed"];
export const SUMMARY_TABLE_LABEL: Record<SummaryTable, string> = { status: "状態", assignee: "担当者", category: "種別", reporter: "登録者", closed: "完了 担当者別" };

/**
 * Counts. `mode: "month"` (default) counts the issues in scope that were created in `month`, the way the 集計 screen does,
 * plus the ones closed in it; `mode: "now"` counts the issues in scope as they stand, and `closed` then reads as the 完了 stages.
 */
export interface SummaryBlock extends BlockScope {
  kind: "summary";
  mode?: "month" | "now"; // default "month"
  month?: MonthRef; // default "current"
  tables?: SummaryTable[]; // default ["status"]
}

export type GanttMonths = 1 | 2 | 3 | 6;
export const GANTT_MONTHS: GanttMonths[] = [1, 2, 3, 6];

/** The gantt chart of the issues in scope over whole months from `month`. */
export interface GanttBlock extends BlockScope {
  kind: "gantt";
  month?: MonthRef; // default "current"
  months?: GanttMonths; // default 1
  groupBy?: "none" | "assignee"; // default "none"
  includeUndated?: boolean; // default false
}

export type Block = IssuesBlock | SummaryBlock | GanttBlock;
export type BlockKind = Block["kind"];
export const BLOCK_KINDS: BlockKind[] = ["issues", "summary", "gantt"];
export const BLOCK_LABEL: Record<BlockKind, string> = { issues: "課題一覧", summary: "件数", gantt: "ガントチャート" };

/** A report body split into Markdown runs and block lines; `line` is 1-based. */
export type Segment = { kind: "markdown"; text: string } | { kind: "block"; block: Block; line: number } | { kind: "invalid"; line: number; text: string };

const BLOCK_LINE = /^::(issues|summary|gantt)(?:\s+(\S.*?))?\s*$/;
const MONTH = /^\d{4}-\d{2}$/;
const DUE_FILTERS: DueFilter[] = ["all", "overdue", "week", "none"];

const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const optStr = (v: unknown): boolean => v === undefined || typeof v === "string";
const optStrArray = (v: unknown): boolean => v === undefined || isStrArray(v);
const optMonth = (v: unknown): boolean => v === undefined || v === "current" || v === "previous" || (typeof v === "string" && MONTH.test(v));
const optOneOf = (v: unknown, all: readonly unknown[]): boolean => v === undefined || all.includes(v);
const optSubset = (v: unknown, all: readonly string[]): boolean => v === undefined || (isStrArray(v) && v.every((x) => all.includes(x)));
const optSortKey = (v: unknown): boolean => v === undefined || (typeof v === "string" && (FIXED_SORT_KEYS.includes(v as (typeof FIXED_SORT_KEYS)[number]) || v.startsWith("field:")));

/** True when every field present has the documented type; unknown keys are ignored, so a newer build's field survives an older one. */
function isScope(v: Record<string, unknown>): boolean {
  return (
    optStrArray(v.keys) &&
    optStrArray(v.statuses) &&
    optStr(v.assignee) &&
    optStr(v.category) &&
    optStrArray(v.labels) &&
    optOneOf(v.due, DUE_FILTERS) &&
    optStr(v.keyword) &&
    optMonth(v.createdIn) &&
    optMonth(v.updatedIn)
  );
}

function isBlockParams(kind: BlockKind, v: Record<string, unknown>): boolean {
  if (!isScope(v)) return false;
  switch (kind) {
    case "issues":
      return (
        optSubset(v.columns, ISSUE_COLUMNS) &&
        optSortKey(v.sort) &&
        (v.desc === undefined || typeof v.desc === "boolean") &&
        optOneOf(v.groupBy, ISSUES_GROUP_BY) &&
        (v.limit === undefined || (Number.isInteger(v.limit) && (v.limit as number) > 0))
      );
    case "summary":
      return optOneOf(v.mode, ["month", "now"]) && optMonth(v.month) && optSubset(v.tables, SUMMARY_TABLES);
    case "gantt":
      return optMonth(v.month) && optOneOf(v.months, GANTT_MONTHS) && optOneOf(v.groupBy, ["none", "assignee"]) && (v.includeUndated === undefined || typeof v.includeUndated === "boolean");
  }
}

/** The block a line holds; null for an ordinary line; `invalid` when whatever follows the kind fails to parse as JSON or a field has the wrong type. */
export function parseBlockLine(line: string): { block: Block } | { invalid: true } | null {
  const m = BLOCK_LINE.exec(line);
  if (m === null) return null;
  const kind = m[1] as BlockKind;
  let params: unknown = {};
  if (m[2] !== undefined) {
    try {
      params = JSON.parse(m[2]);
    } catch {
      return { invalid: true };
    }
  }
  if (typeof params !== "object" || params === null || Array.isArray(params)) return { invalid: true };
  const v = params as Record<string, unknown>;
  if (!isBlockParams(kind, v)) return { invalid: true };
  return { block: { ...v, kind } as Block };
}

const FENCE = /^\s{0,3}(```|~~~)/;

/** Splits the body on its block lines; the Markdown between them keeps its line breaks, and a line inside a code fence is Markdown. */
export function parseBody(body: string): Segment[] {
  const out: Segment[] = [];
  let run: string[] = [];
  let fenced = false;
  const flush = (): void => {
    if (run.length > 0) out.push({ kind: "markdown", text: run.join("\n") });
    run = [];
  };
  body.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (FENCE.test(line)) fenced = !fenced;
    const p = fenced ? null : parseBlockLine(line);
    if (p === null) {
      run.push(line);
      return;
    }
    flush();
    out.push("block" in p ? { kind: "block", block: p.block, line: i + 1 } : { kind: "invalid", line: i + 1, text: line });
  });
  flush();
  return out;
}

/** The line for a block: the kind, then its parameters as JSON without `kind`; `{}` is left off. */
export function serializeBlock(block: Block): string {
  const { kind, ...params } = block;
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  return Object.keys(clean).length === 0 ? `::${kind}` : `::${kind} ${JSON.stringify(clean)}`;
}

/** "YYYY-MM" for a month reference on `today`; anything unreadable is the current month. */
export function resolveMonth(ref: MonthRef | undefined, today: string): string {
  const current = today.slice(0, 7);
  if (ref === undefined || ref === "current") return current;
  if (ref === "previous") return shiftMonth(current, -1);
  return MONTH.test(ref) ? ref : current;
}

export const monthLabel = (month: string): string => `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
export const dateLabel = (ymd: string): string => ymd.slice(0, 10).replace(/-/g, "/");

/** The issues a block covers, in the order they were given. */
export function scopeIssues(issues: Issue[], scope: BlockScope, ctx: ReportContext): Issue[] {
  const statuses = ctx.project.statuses;
  const filter: IssueFilter = {
    statuses: scope.statuses ?? statuses.map((s) => s.id),
    assignee: scope.assignee ?? null,
    reporter: null,
    keyword: scope.keyword ?? "",
    due: scope.due ?? "all",
    category: scope.category ?? null,
    awaitingConfirmation: false,
    labels: scope.labels ?? [],
    fields: {},
  };
  const keys = scope.keys === undefined ? null : new Set(scope.keys);
  const createdIn = scope.createdIn === undefined ? null : resolveMonth(scope.createdIn, ctx.today);
  const updatedIn = scope.updatedIn === undefined ? null : resolveMonth(scope.updatedIn, ctx.today);
  return filterIssues(issues, filter, ctx.today, ctx.me.username, statuses).filter(
    (i) => (keys === null || keys.has(i.key)) && (createdIn === null || monthOf(i.createdAt) === createdIn) && (updatedIn === null || monthOf(i.updatedAt) === updatedIn),
  );
}

/** Every issue an `::issues` or `::gantt` block of the body names, once each, in key order; the wording panel lists these. */
export function reportIssues(body: string, ctx: ReportContext): Issue[] {
  const seen = new Map<string, Issue>();
  for (const seg of parseBody(body)) {
    if (seg.kind !== "block" || seg.block.kind === "summary") continue;
    for (const i of scopeIssues(ctx.issues, seg.block, ctx)) seen.set(i.key, i);
  }
  return [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** `{{today}}`, `{{month}}`, `{{prevMonth}}` and `{{me}}` in the Markdown, replaced when the report renders. */
export const VARIABLES = ["today", "month", "prevMonth", "me"] as const;
export function expandVariables(text: string, ctx: ReportContext, terms: Record<string, string> = {}): string {
  const values: Record<(typeof VARIABLES)[number], string> = {
    today: dateLabel(ctx.today),
    month: monthLabel(resolveMonth("current", ctx.today)),
    prevMonth: monthLabel(resolveMonth("previous", ctx.today)),
    me: termOf(terms, displayNameOf(ctx.users, ctx.me.username)),
  };
  return text.replace(/\{\{(today|month|prevMonth|me)\}\}/g, (_, name: keyof typeof values) => values[name]);
}

/** What a block prints when no issue is in scope; a noun phrase, since the document is the author's, in the author's register. */
export const EMPTY_ROWS = "該当する課題なし";

/** The word the report uses for a name the screens show (Report.terms), or the name itself. */
export const termOf = (terms: Record<string, string>, name: string): string => {
  const t = terms[name];
  return t === undefined || t === "" ? name : t;
};
