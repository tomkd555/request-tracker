import { useState } from "react";
import { showToast } from "../app/toast";
import { useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { today } from "../issues/dates";
import { useIssues } from "../issues/useIssues";
import { errorMessage, M } from "../messages";
import type { ReportContext } from "./blocks";
import { reportFileName, reportToHtml, reportToMarkdown } from "./exportReport";
import { REPORT_CSS } from "./reportCss";
import { ReportDocument } from "./ReportDocument";
import { useReports } from "./useReports";
import "./reports.css";

export function ReportView({ id }: { id: string }): React.JSX.Element {
  const { me, users, project } = useSession();
  const { issues } = useIssues();
  const { byId, loaded, refreshOne } = useReports();
  const [error, setError] = useState<string | null>(null);
  const report = byId.get(id);

  if (!loaded) return <div className="text--loading">読み込み中</div>;
  if (!report) return <p>レポートが見つかりません。</p>;

  const ctx: ReportContext = { issues, users, project, me, today: today() };

  const exportHtml = async (): Promise<void> => {
    setError(null);
    try {
      const saved = await window.api.reports.save(reportToHtml(report, ctx), reportFileName(report, "html"), { name: "HTML", extensions: ["html"] });
      if (saved) showToast(M.htmlSaved);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const exportMarkdown = async (): Promise<void> => {
    setError(null);
    try {
      const saved = await window.api.reports.save(reportToMarkdown(report, ctx), reportFileName(report, "md"), { name: "Markdown", extensions: ["md"] });
      if (saved) showToast(M.markdownSaved);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const copy = async (): Promise<void> => {
    setError(null);
    try {
      await window.api.reports.copy(reportToHtml(report, ctx), reportToMarkdown(report, ctx));
      showToast(M.copied);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async (): Promise<void> => {
    if (!window.confirm(M.confirmDelete(report.title))) return;
    setError(null);
    try {
      await window.api.reports.remove(report.id);
      await refreshOne(report.id);
      navigate("/reports");
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <article>
      <header className="toolbar">
        <h1 className="toolbar__heading">{report.title}</h1>
        <div className="form-actions">
          <a className="link-button" href={`#/reports/${report.id}/edit`}>
            編集
          </a>
          <button type="button" onClick={() => navigate(`/reports/new?from=${report.id}`)}>
            複製
          </button>
          <button type="button" onClick={() => void exportHtml()}>
            HTMLに出力
          </button>
          <button type="button" onClick={() => void exportMarkdown()}>
            Markdownに出力
          </button>
          <button type="button" onClick={() => void copy()}>
            クリップボードにコピー
          </button>
          <button type="button" className="button--danger" onClick={() => void remove()}>
            削除
          </button>
        </div>
      </header>
      {error && <p className="text--error">{error}</p>}
      <div className="report-paper">
        <style>{REPORT_CSS}</style>
        <ReportDocument report={report} ctx={ctx} withTitle={false} />
      </div>
    </article>
  );
}
