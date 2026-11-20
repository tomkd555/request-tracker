import { useRef, useState } from "react";
import type { IssueStatus } from "../../shared/types";
import { displayNameOf, useSession } from "../app/SessionContext";
import { burndownRows, loadMilestoneVersions, type BurndownRow } from "./burndown";
import { BurndownChart, MEASURE_LABEL } from "./BurndownChart";
import type { BurndownMeasure } from "./burndownGeometry";
import { countByMonth, createdInMonth, monthOf, monthlyCountsToCsv, type Count } from "./countByMonth";
import { todayYmd } from "./dates";
import { sumHours } from "./hours";
import { statusName } from "./labels";
import { orderMilestones } from "./milestones";
import { useIssues } from "./useIssues";
import { errorMessage, M } from "../messages";

/** `hasIssues` tells an empty `rows` caused by a range with no day from one caused by a milestone with no issue. */
interface Burndown { rows: BurndownRow[]; dueDay: string | null; today: string; hasIssues: boolean }

function BurndownSection(): React.JSX.Element | null {
  const { project } = useSession();
  const { issues } = useIssues();
  const milestones = orderMilestones(project.milestones ?? []);
  const [milestoneId, setMilestoneId] = useState("");
  // The milestone chosen at this moment: a load that finishes after the choice changed is dropped.
  const chosenId = useRef("");
  const [measure, setMeasure] = useState<BurndownMeasure>("open");
  const [burndown, setBurndown] = useState<Burndown | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (milestones.length === 0) return null;

  const loadBurndown = async (): Promise<void> => {
    const milestone = milestones.find((m) => m.id === milestoneId);
    if (!milestone) return;
    setBusy(true);
    setError(null);
    try {
      const versions = await loadMilestoneVersions(issues, milestone.id, (key) => window.api.issues.history(key));
      if (chosenId.current !== milestone.id) return;
      const today = todayYmd();
      setBurndown({ rows: burndownRows(milestone, versions, project.statuses, today), dueDay: milestone.dueDate, today, hasIssues: versions.some((vs) => vs.some((v) => v.milestone === milestone.id)) });
    } catch (e) {
      if (chosenId.current !== milestone.id) return;
      setBurndown(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings__section">
      <h3 className="settings__heading">バーンダウン</h3>
      <div className="burndown__controls">
        <select
          aria-label="マイルストーン"
          value={milestoneId}
          onChange={(e) => {
            chosenId.current = e.target.value;
            setMilestoneId(e.target.value);
            setBurndown(null);
          }}
        >
          <option value="">{M.selectPrompt}</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={milestoneId === "" || busy} onClick={() => void loadBurndown()}>
          表示
        </button>
        <select aria-label="指標" value={measure} onChange={(e) => setMeasure(e.target.value as BurndownMeasure)}>
          {(Object.keys(MEASURE_LABEL) as BurndownMeasure[]).map((k) => (
            <option key={k} value={k}>
              {MEASURE_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text--error">{error}</p>}
      {burndown !== null && (burndown.rows.length === 0 ? <p className="text--muted">{burndown.hasIssues ? M.burndownNoDays : M.noBurndownIssues}</p> : <BurndownChart rows={burndown.rows} measure={measure} today={burndown.today} dueDay={burndown.dueDay} />)}
    </section>
  );
}

export function Summary(): React.JSX.Element {
  const { users, project } = useSession();
  const { issues } = useIssues();
  const [month, setMonth] = useState(monthOf(new Date().toISOString()));
  const [message, setMessage] = useState<string | null>(null);
  const counts = countByMonth(issues, month, project.statuses);
  const createdHours = sumHours(createdInMonth(issues, month));
  const nameOf = (u: string): string => displayNameOf(users, u);
  const statusLabel = (s: IssueStatus): string => statusName(project.statuses, s);

  const exportCsv = async (): Promise<void> => {
    setMessage(null);
    try {
      const saved = await window.api.summary.exportCsv(monthlyCountsToCsv(counts, { user: nameOf, status: statusLabel }), `summary-${month}.csv`);
      setMessage(saved ? M.csvSaved : null);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const countTable = (title: string, rows: Count[], label: (k: string) => string, total: number = counts.total): React.JSX.Element => (
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
        {countTable("登録者", counts.byReporter, nameOf)}
        {countTable("担当者", counts.byAssignee, (k) => (k === "" ? "未設定" : nameOf(k)))}
        {countTable("状態", counts.byStatus, (k) => statusLabel(k as IssueStatus))}
        {countTable("種別", counts.byCategory, (k) => k || "未設定")}
        {countTable("完了 担当者別", counts.closedByAssignee, (k) => (k === "" ? "未設定" : nameOf(k)), counts.closedTotal)}
        <table className="issue-table">
          <thead>
            <tr>
              <th className="issue-table__header">時間</th>
              <th className="issue-table__header issue-table__header--num">合計</th>
            </tr>
          </thead>
          <tbody>
            <tr className="summary__row">
              <td className="issue-table__cell">予定時間</td>
              <td className="issue-table__cell issue-table__cell--num">{createdHours.estimated}</td>
            </tr>
            <tr className="summary__row">
              <td className="issue-table__cell">実績時間</td>
              <td className="issue-table__cell issue-table__cell--num">{createdHours.actual}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <BurndownSection />
    </div>
  );
}
