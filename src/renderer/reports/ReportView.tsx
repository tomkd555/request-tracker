import { useState } from "react";
import { showToast } from "../app/toast";
import { useSession } from "../app/SessionContext";
import { navigate } from "../app/useHashRoute";
import { todayYmd } from "../issues/dates";
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
  const { byId, isLoaded, refreshOne } = useReports();
  const [error, setError] = useState<string | null>(null);
  const report = byId.get(id);

  if (!isLoaded) return <div className="text--loading">読み込み中</div>;
  if (!report) return <p>レポートが見つかりません</p>;

  const ctx: ReportContext = { issues, users, project, me, today: todayYmd() };

  // `render` runs inside the try, so a report that fails to render shows its error like a failed save.
  const exportAs = async (render: () => string, ext: string, filterName: string, savedMessage: string): Promise<void> => {
    setError(null);
    try {
      const saved = await window.api.reports.save(render(), reportFileName(report, ext), { name: filterName, extensions: [ext] });
      if (saved) showToast(savedMessage);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const copyToClipboard = async (): Promise<void> => {
    setError(null);
    try {
      await window.api.reports.copy(reportToHtml(report, ctx), reportToMarkdown(report, ctx));
      showToast(M.copied);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const deleteReport = async (): Promise<void> => {
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
          <button type="button" onClick={() => void exportAs(() => reportToHtml(report, ctx), "html", "HTML", M.htmlSaved)}>
            HTMLに出力
          </button>
          <button type="button" onClick={() => void exportAs(() => reportToMarkdown(report, ctx), "md", "Markdown", M.markdownSaved)}>
            Markdownに出力
          </button>
          <button type="button" onClick={() => void copyToClipboard()}>
            クリップボードにコピー
          </button>
          <button type="button" className="button--danger" onClick={() => void deleteReport()}>
            削除
          </button>
        </div>
      </header>
      {error && <p className="text--error">{error}</p>}
      <div className="report-paper">
        <style>{REPORT_CSS}</style>
        <ReportDocument report={report} ctx={ctx} showTitle={false} />
      </div>
    </article>
  );
}
