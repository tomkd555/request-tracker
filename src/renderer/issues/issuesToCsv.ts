import type { CustomField, Issue, IssueStatus } from "../../shared/types";
import { cell } from "./countByMonth";
import type { IssueRow } from "./groupByParent";
import { formatHours } from "./hours";
import { formatDate, formatTimestampDate, PRIORITY_LABEL } from "./labels";

export interface CsvNames { user(username: string | null): string; status(status: IssueStatus): string }

const HEADER = ["キー", "件名", "種別", "ラベル", "担当者", "状態", "優先度", "期限日", "更新日", "登録者", "登録日", "親課題", "予定時間", "実績時間"];

/** CSV body (no BOM) of the rows as listed, one line per issue, children after their parent: the fixed columns through 登録日, then 親課題, 予定時間 and 実績時間, then the 汎用列. */
export function issuesToCsv(rows: IssueRow[], names: CsvNames, fields: CustomField[] = []): string {
  const line = (i: Issue): string =>
    [
      i.key,
      i.summary,
      i.category,
      i.labels.join(" "),
      names.user(i.assignee),
      names.status(i.status),
      PRIORITY_LABEL[i.priority],
      formatDate(i.dueDate),
      formatTimestampDate(i.updatedAt),
      names.user(i.reporter),
      formatTimestampDate(i.createdAt),
      i.parentKey ?? "",
      formatHours(i.estimatedHours),
      formatHours(i.actualHours),
      ...fields.map((f) => i.fields[f.id] ?? ""),
    ]
      .map(cell)
      .join(",");
  return [[...HEADER, ...fields.map((f) => f.name)].map(cell).join(","), ...rows.map((r) => line(r.issue))].join("\r\n");
}
