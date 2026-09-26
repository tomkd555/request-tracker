import { useEffect, useMemo, useRef, useState } from "react";
import type { IssueNote, Report } from "../../shared/types";
import { useSession } from "../app/UserContext";
import { navigate, useNavigationGuard } from "../app/useHashRoute";
import { MarkdownEditor, type EditorTool } from "../issues/FieldEditor";
import { today } from "../issues/dates";
import { useIssues } from "../issues/useIssues";
import { errorMessage, M } from "../messages";
import { BLOCK_KINDS, BLOCK_LABEL, parseBlockLine, serializeBlock, type Block, type BlockKind, type ReportContext } from "./blocks";
import { BlockDialog } from "./BlockDialog";
import { REPORT_CSS } from "./reportCss";
import { ReportDocument } from "./ReportDocument";
import { SAMPLE_BODY, SAMPLE_TITLE } from "./sampleReport";
import { useReports } from "./useReports";
import { WordingPanel } from "./WordingPanel";
import "./reports.css";

interface Props {
  id: string | null;
  /** From `?from=` on 複製 (ReportView) or on the 元にする picker's built-in options. */
  from: string | null;
}

interface DialogState { kind: BlockKind; initial: Block | null; commit: (text: string) => void }

const SAMPLE_KEY = "__sample__";

export function ReportEdit({ id, from }: Props): React.JSX.Element {
  const { me, users, project } = useSession();
  const { issues } = useIssues();
  const { byId, reports, loaded, refreshOne, reload } = useReports();
  const existing = id !== null ? byId.get(id) : undefined;
  const source = from !== null ? byId.get(from) : undefined;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [isTemplate, setIsTemplate] = useState(existing?.isTemplate ?? false);
  const [terms, setTerms] = useState<Record<string, string>>(existing?.terms ?? {});
  const [issueNotes, setIssueNotes] = useState<Record<string, IssueNote>>(existing?.issueNotes ?? {});
  const [sourceKey, setSourceKey] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const appliedSource = useRef(false);
  const baseUpdatedAt = useRef<string | null>(null); // the stamp the draft was seeded from; a reload mid-edit must not move it

  // On a reload at #/reports/<id>/edit the report arrives after the first render; take its content then.
  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setBody(existing.body);
      setIsTemplate(existing.isTemplate);
      setTerms(existing.terms);
      setIssueNotes(existing.issueNotes);
      baseUpdatedAt.current = existing.updatedAt;
    }
  }, [existing?.id]);

  // #/reports/new?from=<id> (複製): the source report may still be loading when this screen first renders.
  useEffect(() => {
    if (!existing && source && !appliedSource.current) {
      appliedSource.current = true;
      setBody(source.body);
      setTerms(source.terms);
      setIssueNotes(source.issueNotes);
    }
  }, [existing, source]);

  // Compared by content: every screen change re-reads the list, so `existing` is a fresh object each time.
  const dirty = existing
    ? title !== existing.title || body !== existing.body || isTemplate !== existing.isTemplate || JSON.stringify(terms) !== JSON.stringify(existing.terms) || JSON.stringify(issueNotes) !== JSON.stringify(existing.issueNotes)
    : title !== "" || body !== "";
  useNavigationGuard(dirty && !busy);

  const day = today();
  const ctx = useMemo<ReportContext>(() => ({ issues, users, project, me, today: day }), [issues, users, project, me, day]);

  if (id !== null && !loaded) return <div className="text--loading">読み込み中</div>;
  if (id !== null && !existing) return <p>レポートが見つかりません。</p>;

  const templates = reports.filter((r) => r.isTemplate);
  const titleMissing = title.trim() === "";

  const applySource = (key: string): void => {
    setSourceKey(key);
    if (key === "") {
      setBody("");
      setTerms({});
      setIssueNotes({});
    } else if (key === SAMPLE_KEY) {
      setBody(SAMPLE_BODY);
      setTerms({});
      setIssueNotes({});
    } else {
      const t = byId.get(key);
      if (!t) return;
      setBody(t.body);
      setTerms(t.terms);
      setIssueNotes(t.issueNotes);
    }
  };

  const tools: EditorTool[] = BLOCK_KINDS.map((kind) => ({
    label: `${BLOCK_LABEL[kind]}…`, // opens a dialog, the way a Windows menu item with an ellipsis does
    onClick(sel, insert) {
      const lineStart = sel.text.lastIndexOf("\n", sel.start - 1) + 1;
      const nl = sel.text.indexOf("\n", sel.start);
      const lineEnd = nl === -1 ? sel.text.length : nl;
      const parsed = parseBlockLine(sel.text.slice(lineStart, lineEnd));
      const editingBlock = parsed !== null && "block" in parsed && parsed.block.kind === kind ? parsed.block : null;
      const commit = editingBlock === null ? (text: string) => insert(text) : (text: string) => setBody((b) => b.slice(0, lineStart) + text + b.slice(lineEnd));
      setDialog({ kind, initial: editingBlock, commit });
    },
  }));

  const save = async (): Promise<void> => {
    setSubmitted(true);
    setError(null);
    if (titleMissing) return;
    setBusy(true);
    const now = new Date().toISOString();
    try {
      if (existing) {
        const report: Report = { ...existing, title: title.trim(), body, isTemplate, terms, issueNotes, updatedAt: now, updatedBy: me.username };
        await window.api.reports.put(report, baseUpdatedAt.current ?? existing.updatedAt);
        await refreshOne(report.id);
        navigate(`/reports/${report.id}`);
      } else {
        const created = await window.api.reports.create({
          id: "",
          title: title.trim(),
          body,
          isTemplate,
          terms,
          issueNotes,
          createdAt: now,
          createdBy: me.username,
          updatedAt: now,
          updatedBy: me.username,
        });
        await reload();
        navigate(`/reports/${created.id}`);
      }
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
    <form
      className="issue-form report-edit"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !busy) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <h1>{existing ? "レポートの編集" : from !== null ? "レポートの複製" : "新規レポート"}</h1>
      <label className="issue-form__field">
        タイトル
        <input className="issue-form__control" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={submitted && titleMissing} autoFocus />
        {submitted && titleMissing && <span className="issue-form__error">{M.titleRequired}</span>}
      </label>
      <label className="issue-form__field settings__inline">
        <input type="checkbox" checked={isTemplate} onChange={(e) => setIsTemplate(e.target.checked)} />
        このレポートをテンプレートにする
      </label>
      {!existing && from === null && (
        <label className="issue-form__field">
          元にする
          <select className="issue-form__control" value={sourceKey} onChange={(e) => applySource(e.target.value)}>
            <option value="">白紙</option>
            <option value={SAMPLE_KEY}>{SAMPLE_TITLE}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <MarkdownEditor
        value={body}
        onChange={setBody}
        preview={(v) => (
          <>
            <style>{REPORT_CSS}</style>
            <ReportDocument report={{ title, body: v, terms, issueNotes }} ctx={ctx} />
          </>
        )}
        rows={24}
        tools={tools}
        ariaLabel="本文"
      />
      <WordingPanel draft={{ body, terms, issueNotes }} ctx={ctx} onChange={(next) => { setTerms(next.terms); setIssueNotes(next.issueNotes); }} />
      {error && <p className="text--error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={busy}>
          保存
        </button>
        <button type="button" onClick={() => navigate(existing ? `/reports/${existing.id}` : "/reports")}>
          キャンセル
        </button>
      </div>
    </form>
    {dialog && (
      <BlockDialog
        kind={dialog.kind}
        initial={dialog.initial}
        project={project}
        users={users}
        onClose={(block) => {
          const commit = dialog.commit;
          setDialog(null);
          if (block !== null) commit(serializeBlock(block));
        }}
      />
    )}
    </>
  );
}
