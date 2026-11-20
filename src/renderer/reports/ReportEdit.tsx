import { useEffect, useMemo, useRef, useState } from "react";
import type { IssueNote, Report } from "../../shared/types";
import { useSession } from "../app/SessionContext";
import { navigate, useNavigationGuard } from "../app/useHashRoute";
import { MarkdownEditor, type EditorTool } from "../issues/FieldEditor";
import { todayYmd } from "../issues/dates";
import { useIssues } from "../issues/useIssues";
import { errorMessage, isStale, M } from "../messages";
import { BLOCK_KINDS, BLOCK_LABEL, parseBody, serializeBlock, type Block, type BlockKind, type ReportContext } from "./blocks";
import { BlockDialog } from "./BlockDialog";
import { REPORT_CSS } from "./reportCss";
import { ReportDocument } from "./ReportDocument";
import { SAMPLE_BODY, SAMPLE_TITLE } from "./sampleReport";
import { useReports } from "./useReports";
import { WordingPanel } from "./WordingPanel";
import "./reports.css";

interface Props {
  id: string | null;
  /** From `?from=` on 複製 (ReportView). */
  from: string | null;
}

interface BlockDialogState { kind: BlockKind; initial: Block | null; commit: (text: string) => void }

const SAMPLE_KEY = "__sample__";

export function ReportEdit({ id, from }: Props): React.JSX.Element {
  const { me, users, project } = useSession();
  const { issues } = useIssues();
  const { byId, reports, isLoaded, refreshOne, reload } = useReports();
  const existing = id !== null ? byId.get(id) : undefined;
  const copySource = from !== null ? byId.get(from) : undefined;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [isTemplate, setIsTemplate] = useState(existing?.isTemplate ?? false);
  const [terms, setTerms] = useState<Record<string, string>>(existing?.terms ?? {});
  const [issueNotes, setIssueNotes] = useState<Record<string, IssueNote>>(existing?.issueNotes ?? {});
  const [startingPointKey, setStartingPointKey] = useState("");
  const [blockDialog, setBlockDialog] = useState<BlockDialogState | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const hasAppliedSource = useRef(false);
  const baseUpdatedAt = useRef<string | null>(null); // the stamp the draft was seeded from; a reload mid-edit must not move it
  const [canReload, setCanReload] = useState(false);
  const [reseedCount, setReseedCount] = useState(0);
  const seeded = useRef<string | null>(null); // the draft as it was last seeded, as JSON
  const appliedReseedCount = useRef(reseedCount);
  const draftJson = JSON.stringify({ title, body, isTemplate, terms, issueNotes });

  // On a reload at #/reports/<id>/edit the report arrives after the first render, and the share is read again when the screen opens:
  // a version that arrives while the draft still holds what it was seeded with replaces it, so an edit never starts from an outdated report.
  // 再読み込み takes the stored version whatever the draft holds.
  useEffect(() => {
    if (!existing) return;
    const isUntouched = seeded.current === null || draftJson === seeded.current;
    const isReseedAsked = appliedReseedCount.current !== reseedCount;
    appliedReseedCount.current = reseedCount;
    if (!isUntouched && !isReseedAsked) return;
    setTitle(existing.title);
    setBody(existing.body);
    setIsTemplate(existing.isTemplate);
    setTerms(existing.terms);
    setIssueNotes(existing.issueNotes);
    seeded.current = JSON.stringify({ title: existing.title, body: existing.body, isTemplate: existing.isTemplate, terms: existing.terms, issueNotes: existing.issueNotes });
    baseUpdatedAt.current = existing.updatedAt;
  }, [existing?.id, existing?.updatedAt, reseedCount]);

  // #/reports/new?from=<id> (複製): the source report may still be loading when this screen first renders.
  useEffect(() => {
    if (!existing && copySource && !hasAppliedSource.current) {
      hasAppliedSource.current = true;
      setBody(copySource.body);
      setTerms(copySource.terms);
      setIssueNotes(copySource.issueNotes);
    }
  }, [existing, copySource]);

  // Compared by content: every screen change re-reads the list, so `existing` is a fresh object each time.
  const dirty = existing
    ? title !== existing.title || body !== existing.body || isTemplate !== existing.isTemplate || JSON.stringify(terms) !== JSON.stringify(existing.terms) || JSON.stringify(issueNotes) !== JSON.stringify(existing.issueNotes)
    : title !== "" || body !== "" || isTemplate || Object.keys(terms).length > 0 || Object.keys(issueNotes).length > 0;
  useNavigationGuard(dirty && !isSaving);

  const today = todayYmd();
  const ctx = useMemo<ReportContext>(() => ({ issues, users, project, me, today }), [issues, users, project, me, today]);

  if (id !== null && !isLoaded) return <div className="text--loading">読み込み中</div>;
  if (id !== null && !existing) return <p>レポートが見つかりません</p>;

  const templates = reports.filter((r) => r.isTemplate);
  const titleMissing = title.trim() === "";
  const heading = existing ? "レポートの編集" : from !== null ? "レポートの複製" : "新規レポート";

  const applySource = (key: string): void => {
    setStartingPointKey(key);
    if (key === "") {
      setBody("");
      setTerms({});
      setIssueNotes({});
    } else if (key === SAMPLE_KEY) {
      setBody(SAMPLE_BODY);
      setTerms({});
      setIssueNotes({});
    } else {
      const template = byId.get(key);
      if (!template) return;
      setBody(template.body);
      setTerms(template.terms);
      setIssueNotes(template.issueNotes);
    }
  };

  const tools: EditorTool[] = BLOCK_KINDS.map((kind) => ({
    label: `${BLOCK_LABEL[kind]}…`, // opens a dialog, the way a Windows menu item with an ellipsis does
    onClick(sel, insert) {
      // At the first character, lastIndexOf(…, -1) still finds a line break at index 0 and would give the second line.
      const lineStart = sel.start === 0 ? 0 : sel.text.lastIndexOf("\n", sel.start - 1) + 1;
      const lineBreakAt = sel.text.indexOf("\n", sel.start);
      const lineEnd = lineBreakAt === -1 ? sel.text.length : lineBreakAt;
      // parseBody reads a block line inside a code fence as Markdown, so the caret on such a line inserts a new block.
      const lineNumber = sel.text.slice(0, lineStart).split("\n").length;
      const segment = parseBody(sel.text).find((s) => s.kind !== "markdown" && s.line === lineNumber);
      const editingBlock = segment?.kind === "block" && segment.block.kind === kind ? segment.block : null;
      // On a block line of another kind, or one that fails to parse, the new block goes below it: inserted at the caret it would cut that line in two.
      const commit =
        editingBlock !== null
          ? (text: string) => setBody((b) => b.slice(0, lineStart) + text + b.slice(lineEnd))
          : segment !== undefined
            ? (text: string) => setBody((b) => `${b.slice(0, lineEnd)}\n${text}${b.slice(lineEnd)}`)
            : (text: string) => insert(text);
      setBlockDialog({ kind, initial: editingBlock, commit });
    },
  }));

  const reloadDraft = async (): Promise<void> => {
    if (id === null || !window.confirm(M.confirmDiscard)) return;
    setError(null);
    setCanReload(false);
    try {
      await refreshOne(id);
      setReseedCount((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const save = async (): Promise<void> => {
    setHasSubmitted(true);
    setError(null);
    setCanReload(false);
    if (titleMissing) return;
    setIsSaving(true);
    const now = new Date().toISOString();
    try {
      if (existing) {
        const report: Report = { ...existing, title: title.trim(), body, isTemplate, terms, issueNotes, updatedAt: now, updatedBy: me.username };
        await window.api.reports.put(report, baseUpdatedAt.current ?? existing.updatedAt);
        // From here the report is saved: a failed re-read must not show as a failed save, nor leave the form to be sent a second time. The next screen reads the share again.
        await refreshOne(report.id).catch(() => undefined);
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
        await reload().catch(() => undefined); // saved, as above
        navigate(`/reports/${created.id}`);
      }
    } catch (e) {
      setError(errorMessage(e));
      setCanReload(isStale(e));
      setIsSaving(false);
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
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isSaving) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <h1>{heading}</h1>
      <label className="issue-form__field">
        タイトル
        <input className="issue-form__control" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={hasSubmitted && titleMissing} autoFocus />
        {hasSubmitted && titleMissing && <span className="issue-form__error">{M.titleRequired}</span>}
      </label>
      <label className="issue-form__field settings__inline">
        <input type="checkbox" checked={isTemplate} onChange={(e) => setIsTemplate(e.target.checked)} />
        このレポートをテンプレートにする
      </label>
      {!existing && from === null && (
        <label className="issue-form__field">
          元にする
          <select className="issue-form__control" value={startingPointKey} onChange={(e) => applySource(e.target.value)}>
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
      {error && (
        <p className="text--error">
          {error}
          {canReload && (
            <>
              {" "}
              <button type="button" className="button--link" onClick={() => void reloadDraft()}>
                再読み込み
              </button>
            </>
          )}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={isSaving}>
          保存
        </button>
        <button type="button" onClick={() => navigate(existing ? `/reports/${existing.id}` : "/reports")}>
          キャンセル
        </button>
      </div>
    </form>
    {blockDialog && (
      <BlockDialog
        kind={blockDialog.kind}
        initial={blockDialog.initial}
        project={project}
        users={users}
        onClose={(block) => {
          const commit = blockDialog.commit;
          setBlockDialog(null);
          if (block !== null) commit(serializeBlock(block));
        }}
      />
    )}
    </>
  );
}
