import type { IssueDraft } from "../../shared/api";
import { depthOf, MAX_DEPTH } from "../../shared/issueTree";
import { ISSUE_PRIORITIES, type Issue, type IssuePriority, type Project, type User } from "../../shared/types";
import { stripFormulaGuard } from "./csv";
import { parseHours } from "./hours";
import { firstOfKind, PRIORITY_LABEL } from "./labels";

/** Data rows one file may hold. */
export const MAX_IMPORT_ROWS = 250;

export interface ImportContext {
  project: Project;
  users: User[];
  /** Issues already in the store, for 親課題 given by key. */
  issues: Issue[];
  /** Username written as 登録者 and 更新者. */
  reporter: string;
  /** ISO timestamp written as 登録日 and 更新日. */
  now: string;
}

type ImportErrorCode = "summary" | "category" | "label" | "assignee" | "status" | "priority" | "milestone" | "date" | "dateOrder" | "hours" | "parent" | "depth" | "field";
export interface CellProblem { code: ImportErrorCode; column: string; value: string }

/** An existing issue by key, or the draft of an earlier row by its index among the data rows. */
type ParentRef = { key: string } | { row: number };

/** A row that can be created (the draft has parentKey null; `parent` says what to set once the key is known) or the errors that stop it. */
export type PlannedRow = { ok: true; draft: IssueDraft; parent: ParentRef | null } | { ok: false; summary: string; errors: CellProblem[] };

export interface ImportPlan { refused: "no-summary-column" | "no-rows" | "too-many" | null; rows: PlannedRow[] }

const DATE_TEXT = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;

/** YYYY-MM-DD for `YYYY-MM-DD` or `YYYY/MM/DD` naming a real day; null otherwise. */
function parseDate(text: string): string | null {
  const m = DATE_TEXT.exec(text);
  if (m === null) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const PRIORITY_BY_LABEL = new Map<string, IssuePriority>(ISSUE_PRIORITIES.map((p) => [PRIORITY_LABEL[p], p]));

/**
 * The names in a ラベル cell, in order. At each word the longest project label that starts there and ends at a space or the cell's end
 * is read whole, since the export joins names with spaces and a name may hold one; otherwise the word up to the next space is one name.
 */
function labelNamesIn(text: string, projectNames: string[]): string[] {
  const longestFirst = [...projectNames].sort((a, b) => b.length - a.length);
  const names: string[] = [];
  let rest = text.trim();
  while (rest !== "") {
    const known = longestFirst.find((n) => rest.startsWith(n) && (rest.length === n.length || /\s/.test(rest[n.length])));
    const name = known ?? rest.split(/\s/, 1)[0];
    names.push(name);
    rest = rest.slice(name.length).trimStart();
  }
  return names;
}

/** Turns parsed CSV rows (the first is the header) into one planned row per data row. */
export function planImport(csv: string[][], ctx: ImportContext): ImportPlan {
  const { project, users, issues } = ctx;
  if (csv.length === 0) return { refused: "no-rows", rows: [] };
  const header = csv[0].map((h) => stripFormulaGuard(h).trim());
  const columnIndex = new Map<string, number>();
  header.forEach((h, i) => {
    if (!columnIndex.has(h)) columnIndex.set(h, i);
  });
  if (!columnIndex.has("件名")) return { refused: "no-summary-column", rows: [] };
  const dataRows = csv.slice(1).filter((r) => r.some((c) => c !== ""));
  if (dataRows.length === 0) return { refused: "no-rows", rows: [] };
  if (dataRows.length > MAX_IMPORT_ROWS) return { refused: "too-many", rows: [] };

  const byKey = new Map(issues.map((i) => [i.key, i]));
  const milestones = project.milestones ?? [];
  const labelNames = project.labels.map((l) => l.name);
  const defaultStatus = (firstOfKind(project.statuses, "active") ?? project.statuses[0]).id;
  const depths: number[] = [];
  const cellText = (r: string[], column: string): string => {
    const i = columnIndex.get(column);
    return i === undefined ? "" : stripFormulaGuard(r[i] ?? "").trim();
  };
  const keys = dataRows.map((r) => cellText(r, "キー"));
  const summaries = dataRows.map((r) => cellText(r, "件名"));

  const rows = dataRows.map((r, index): PlannedRow => {
    const errors: CellProblem[] = [];
    const fail = (code: ImportErrorCode, column: string, value: string): void => void errors.push({ code, column, value });
    const summary = summaries[index];
    if (summary === "") fail("summary", "件名", "");

    const categoryText = cellText(r, "種別");
    let category = project.categories[0] ?? "";
    if (categoryText !== "") {
      if (project.categories.includes(categoryText)) category = categoryText;
      else fail("category", "種別", categoryText);
    }

    const labels: string[] = [];
    for (const name of labelNamesIn(cellText(r, "ラベル"), labelNames)) {
      if (!labelNames.includes(name)) fail("label", "ラベル", name);
      else if (!labels.includes(name)) labels.push(name);
    }

    const assigneeText = cellText(r, "担当者");
    let assignee: string | null = null;
    if (assigneeText !== "") {
      assignee = users.find((u) => u.displayName === assigneeText)?.username ?? null;
      if (assignee === null) fail("assignee", "担当者", assigneeText);
    }

    const statusText = cellText(r, "状態");
    let status = defaultStatus;
    if (statusText !== "") {
      const s = project.statuses.find((x) => x.name === statusText);
      if (s) status = s.id;
      else fail("status", "状態", statusText);
    }

    const priorityText = cellText(r, "優先度");
    let priority: IssuePriority = "normal";
    if (priorityText !== "") {
      const p = PRIORITY_BY_LABEL.get(priorityText);
      if (p) priority = p;
      else fail("priority", "優先度", priorityText);
    }

    const milestoneText = cellText(r, "マイルストーン");
    let milestone: string | null = null;
    if (milestoneText !== "") {
      milestone = milestones.find((m) => m.name === milestoneText)?.id ?? null;
      if (milestone === null) fail("milestone", "マイルストーン", milestoneText);
    }

    const dateTexts = { 開始日: cellText(r, "開始日"), 期限日: cellText(r, "期限日") };
    const dates: Record<"開始日" | "期限日", string | null> = { 開始日: null, 期限日: null };
    for (const name of ["開始日", "期限日"] as const) {
      const text = dateTexts[name];
      if (text === "") continue;
      dates[name] = parseDate(text);
      if (dates[name] === null) fail("date", name, text);
    }
    if (dates.開始日 !== null && dates.期限日 !== null && dates.期限日 < dates.開始日) fail("dateOrder", "期限日", dateTexts.期限日);

    const hours: Record<"予定時間" | "実績時間", number | null> = { 予定時間: null, 実績時間: null };
    for (const name of ["予定時間", "実績時間"] as const) {
      const text = cellText(r, name);
      const parsed = parseHours(text);
      if (parsed.ok) hours[name] = parsed.value;
      else fail("hours", name, text);
    }

    const fields: Record<string, string> = {};
    for (const f of project.fields) {
      const value = cellText(r, f.name);
      if (value === "") continue;
      if (f.options.length > 0 && !f.options.includes(value)) fail("field", f.name, value);
      else fields[f.id] = value;
    }

    // A parent names a row above by that row's キー (an export read back keeps its own tree, whatever keys the project already holds),
    // else an existing issue by key, else the first row above with that 件名.
    const parentText = cellText(r, "親課題");
    let parent: ParentRef | null = null;
    depths[index] = 1;
    if (parentText !== "") {
      const byRowKey = keys.findIndex((k, i) => i < index && k === parentText);
      const bySummary = summaries.findIndex((s, i) => i < index && s === parentText);
      if (byRowKey !== -1) parent = { row: byRowKey };
      else if (byKey.has(parentText)) parent = { key: parentText };
      else if (bySummary !== -1) parent = { row: bySummary };
      if (parent === null) fail("parent", "親課題", parentText);
      else {
        const depth = ("key" in parent ? depthOf(byKey, parent.key) : depths[parent.row]) + 1;
        depths[index] = depth;
        if (depth > MAX_DEPTH) fail("depth", "親課題", parentText);
      }
    }

    if (errors.length > 0) return { ok: false, summary, errors };
    const description = cellText(r, "詳細") || (project.categoryTemplates[category]?.body ?? "");
    return {
      ok: true,
      parent,
      draft: {
        summary,
        description,
        category,
        status,
        priority,
        labels,
        assignee,
        reporter: ctx.reporter,
        parentKey: null,
        startDate: dates.開始日,
        dueDate: dates.期限日,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        updatedBy: ctx.reporter,
        fields,
        relations: [],
        milestone,
        estimatedHours: hours.予定時間,
        actualHours: hours.実績時間,
      },
    };
  });
  return { refused: null, rows };
}

export interface ImportResult {
  created: number;
  /** 1-based data row at which a create failed. */
  failedRow: number | null;
  error: string | null;
}

/** Creates the rows from the top, parents first, setting each parentKey to the key the store allocated; stops at the first failure. Creates nothing while a row has errors. */
export async function runImport(rows: PlannedRow[], create: (draft: IssueDraft) => Promise<{ key: string }>): Promise<ImportResult> {
  const okRows = rows.filter((r): r is Extract<PlannedRow, { ok: true }> => r.ok);
  if (okRows.length !== rows.length) return { created: 0, failedRow: null, error: null };
  const keys: string[] = [];
  for (let i = 0; i < okRows.length; i++) {
    const row = okRows[i];
    const parentKey = row.parent === null ? null : "key" in row.parent ? row.parent.key : keys[row.parent.row];
    try {
      keys.push((await create({ ...row.draft, parentKey })).key);
    } catch (e) {
      return { created: i, failedRow: i + 1, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { created: okRows.length, failedRow: null, error: null };
}
