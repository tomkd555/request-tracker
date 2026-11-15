import { useState } from "react";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { showToast } from "../app/toast";
import { errorMessage, M } from "../messages";
import { parseCsv } from "./csv";
import { MAX_IMPORT_ROWS, planImport, runImport, type ImportPlan } from "./importPlan";
import { PRIORITY_LABEL, statusName } from "./labels";
import { useIssues } from "./useIssues";

export function IssueImport(): React.JSX.Element {
  const { me, users, project } = useSession();
  const { issues, reload } = useIssues();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false); // a run that stopped part-way created its first rows; the same preview must not run again

  const choose = async (): Promise<void> => {
    setMessage(null);
    try {
      const text = await window.api.files.openText({ name: "CSV", extensions: ["csv"] });
      if (text === null) return;
      setStopped(false);
      setPlan(planImport(parseCsv(text), { project, users, issues, reporter: me.username, now: new Date().toISOString() }));
    } catch (e) {
      setPlan(null);
      setMessage(errorMessage(e));
    }
  };

  const register = async (rows: ImportPlan["rows"]): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const result = await runImport(rows, (draft) => window.api.issues.create(draft));
    try {
      await reload();
    } catch (e) {
      setMessage(errorMessage(e));
    }
    setBusy(false);
    if (result.failedRow === null) {
      showToast(M.importCreated(result.created));
      navigate("/issues");
    } else {
      setMessage(`${M.importCreated(result.created)}　${M.importFailedAt(result.failedRow, errorMessage(result.error ?? ""))}　${M.importRetry}`);
      setStopped(true);
    }
  };

  const refusal = plan?.refused === "no-summary-column" ? M.importNoSummaryColumn : plan?.refused === "no-rows" ? M.importNoRows : plan?.refused === "too-many" ? M.importTooMany(MAX_IMPORT_ROWS) : null;
  const rows = plan?.rows ?? [];
  const blocked = stopped || rows.length === 0 || rows.some((r) => !r.ok);

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">CSVから登録</h1>
        <div className="form-actions">
          <button type="button" disabled={busy} onClick={() => void choose()}>
            ファイルを選ぶ
          </button>
          <button type="button" className="button--primary" disabled={busy || blocked} onClick={() => void register(rows)}>
            登録
          </button>
          <button type="button" onClick={() => navigate("/issues")}>
            キャンセル
          </button>
        </div>
      </header>
      <p className="text--muted">{M.importGuide(MAX_IMPORT_ROWS)}</p>
      {message && <p className="text--error">{message}</p>}
      {refusal && <p className="text--error">{refusal}</p>}
      {rows.length > 0 && (
        <table className="issue-table" aria-label="登録する課題">
          <thead>
            <tr>
              {["行", "件名", "種別", "担当者", "状態", "優先度", "エラー"].map((h) => (
                <th key={h} className="issue-table__header">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="issue-table__cell">{i + 1}</td>
                <td className="issue-table__cell">{r.ok ? r.draft.summary : r.summary}</td>
                <td className="issue-table__cell">{r.ok ? r.draft.category : ""}</td>
                <td className="issue-table__cell">{r.ok ? displayNameOf(users, r.draft.assignee) : ""}</td>
                <td className="issue-table__cell">{r.ok ? statusName(project.statuses, r.draft.status) : ""}</td>
                <td className="issue-table__cell">{r.ok ? PRIORITY_LABEL[r.draft.priority] : ""}</td>
                <td className="issue-table__cell text--error">{r.ok ? "" : r.errors.map((e) => M.importError(e)).join("、")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
