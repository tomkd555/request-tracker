import { useState } from "react";
import type { IssueStatus } from "../../shared/types";
import { displayNameOf, useSession } from "../app/UserContext";
import { countByMonth, monthOf, toCsv, type Count } from "./countByMonth";
import { STATUS_LABEL } from "./labels";
import { useIssues } from "./useIssues";

export function Summary(): React.JSX.Element {
  const { users } = useSession();
  const { issues } = useIssues();
  const [month, setMonth] = useState(monthOf(new Date().toISOString()));
  const [message, setMessage] = useState<string | null>(null);
  const counts = countByMonth(issues, month);
  const user = (u: string): string => displayNameOf(users, u);
  const status = (s: IssueStatus): string => STATUS_LABEL[s];

  const exportCsv = async (): Promise<void> => {
    setMessage(null);
    try {
      const saved = await window.api.summary.exportCsv(toCsv(counts, { user, status }), `summary-${month}.csv`);
      setMessage(saved ? "CSVを保存しました" : null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const table = (title: string, rows: Count[], label: (k: string) => string, total: number = counts.total): React.JSX.Element => (
    <table className="issue-table">
      <thead>
        <tr>
          <th className="issue-table__header">{title}</th>
          <th className="issue-table__header issue-table__header--num">件数</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="summary__row">
            <td className="issue-table__cell">{label(r.key)}</td>
            <td className="issue-table__cell issue-table__cell--num">{r.count}</td>
          </tr>
        ))}
        <tr className="summary__row summary__row--total">
          <td className="issue-table__cell">合計</td>
          <td className="issue-table__cell issue-table__cell--num">{total}</td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">集計</h1>
        <div className="form-actions">
          <input type="month" className="summary__month-input" aria-label="対象月" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button type="button" onClick={() => void exportCsv()}>
            CSVに出力
          </button>
        </div>
      </header>
      {message && <p className="text--muted">{message}</p>}
      <div className="summary__grid">
        {table("登録者", counts.byReporter, user)}
        {table("担当者", counts.byAssignee, (k) => (k === "" ? "未設定" : user(k)))}
        {table("状態", counts.byStatus, (k) => status(k as IssueStatus))}
        {table("種別", counts.byCategory, (k) => k || "未設定")}
        {table("完了 担当者別", counts.closedByAssignee, (k) => (k === "" ? "未設定" : user(k)), counts.closedTotal)}
      </div>
    </div>
  );
}
