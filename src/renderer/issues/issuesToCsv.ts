import type { Issue, IssueStatus } from "../../shared/types";
import { cell } from "./countByMonth";
import type { IssueRow } from "./groupByParent";
import { formatDate, PRIORITY_LABEL, STATUS_LABEL } from "./labels";

export interface CsvNames { user(username: string | null): string; status(status: IssueStatus): string }

const HEADER = ["キー", "件名", "種別", "担当者", "状態", "優先度", "期限日", "更新日", "登録者", "登録日"];

/** CSV body (no BOM) of the rows as listed, one line per issue, children after their parent. */
export function issuesToCsv(rows: IssueRow[], names: CsvNames): string {
  const line = (i: Issue): string =>
    [i.key, i.summary, i.category, names.user(i.assignee), names.status(i.status), PRIORITY_LABEL[i.priority], formatDate(i.dueDate), formatDate(i.updatedAt), names.user(i.reporter), formatDate(i.createdAt)]
      .map(cell)
      .join(",");
  return [HEADER.map(cell).join(","), ...rows.map((r) => line(r.issue))].join("\r\n");
}

export const defaultStatusName = (s: IssueStatus): string => STATUS_LABEL[s];
