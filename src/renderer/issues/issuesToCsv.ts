import type { CustomField, Issue, IssueStatus, Milestone } from "../../shared/types";
import { csvCell } from "./csv";
import type { IssueRow } from "./groupByParent";
import { formatHours } from "./hours";
import { formatDate, formatTimestampDate, PRIORITY_LABEL, RELATION_LABEL } from "./labels";
import { milestoneName } from "./milestones";

export interface CsvNames { user(username: string | null): string; status(status: IssueStatus): string }

/** What a cell needs besides the issue: the display names, and the project's マイルストーン for their names. */
interface CsvContext { names: CsvNames; milestones: Milestone[] }
interface CsvColumn { header: string; text(issue: Issue, context: CsvContext): string }

/** Every field of an issue except `fields`, which becomes one column per 汎用列 of the project. */
type ColumnField = Exclude<keyof Issue, "fields">;

/**
 * The export columns, in file order: one per field of an issue. The type requires an entry for every field, so a field
 * added to `Issue` cannot be left out of the export. The headers of the fields the CSV import reads are the names it reads.
 */
const COLUMN_BY_FIELD: Record<ColumnField, CsvColumn> = {
  key: { header: "キー", text: (issue) => issue.key },
  summary: { header: "件名", text: (issue) => issue.summary },
  category: { header: "種別", text: (issue) => issue.category },
  labels: { header: "ラベル", text: (issue) => issue.labels.join(" ") },
  assignee: { header: "担当者", text: (issue, { names }) => names.user(issue.assignee) },
  status: { header: "状態", text: (issue, { names }) => names.status(issue.status) },
  priority: { header: "優先度", text: (issue) => PRIORITY_LABEL[issue.priority] },
  dueDate: { header: "期限日", text: (issue) => formatDate(issue.dueDate) },
  updatedAt: { header: "更新日", text: (issue) => formatTimestampDate(issue.updatedAt) },
  reporter: { header: "登録者", text: (issue, { names }) => names.user(issue.reporter) },
  createdAt: { header: "登録日", text: (issue) => formatTimestampDate(issue.createdAt) },
  parentKey: { header: "親課題", text: (issue) => issue.parentKey ?? "" },
  estimatedHours: { header: "予定時間", text: (issue) => formatHours(issue.estimatedHours) },
  actualHours: { header: "実績時間", text: (issue) => formatHours(issue.actualHours) },
  startDate: { header: "開始日", text: (issue) => formatDate(issue.startDate) },
  milestone: { header: "マイルストーン", text: (issue, { milestones }) => milestoneName(milestones, issue.milestone) },
  updatedBy: { header: "更新者", text: (issue, { names }) => names.user(issue.updatedBy) },
  relations: { header: "関連課題", text: (issue) => issue.relations.map((relation) => `${RELATION_LABEL[relation.type]}:${relation.key}`).join(" ") },
  description: { header: "詳細", text: (issue) => issue.description },
};

/**
 * CSV body (no BOM) of the rows as listed, one line per issue, children after their parent: a column for every field of an
 * issue (COLUMN_BY_FIELD), then one per 汎用列 of `fields`. マイルストーン holds the name from `milestones`, empty for an id missing there.
 */
export function issuesToCsv(rows: IssueRow[], names: CsvNames, fields: CustomField[] = [], milestones: Milestone[] = []): string {
  const context: CsvContext = { names, milestones };
  const columns: CsvColumn[] = [
    ...Object.values(COLUMN_BY_FIELD),
    ...fields.map((field) => ({ header: field.name, text: (issue: Issue) => issue.fields[field.id] ?? "" })),
  ];
  const headerLine = columns.map((column) => csvCell(column.header)).join(",");
  const issueLines = rows.map((row) => columns.map((column) => csvCell(column.text(row.issue, context))).join(","));
  return [headerLine, ...issueLines].join("\r\n");
}
