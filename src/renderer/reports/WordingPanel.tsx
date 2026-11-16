import { useEffect, useMemo, useState } from "react";
import type { IssueNote } from "../../shared/types";
import { M } from "../messages";
import { blockIssuesOf, type ReportContent, type ReportContext } from "./blocks";

type WordingDraft = Omit<ReportContent, "title">;

interface Props {
  draft: WordingDraft;
  ctx: ReportContext;
  onChange(next: { terms: Record<string, string>; issueNotes: Record<string, IssueNote> }): void;
}

interface TermRow { from: string; to: string }

const termRowsOf = (terms: Record<string, string>): TermRow[] => Object.entries(terms).map(([from, to]) => ({ from, to }));
const termsOf = (rows: TermRow[]): Record<string, string> => Object.fromEntries(rows.filter((r) => r.from.trim() !== "").map((r) => [r.from.trim(), r.to]));

const EMPTY_NOTE: IssueNote = { summary: "", note: "" };

/** 用語の言い換え (Report.terms) and 課題ごとの言い換え (Report.issueNotes), each an editable table; a row with a blank 元の用語 stays on screen and is left out of `terms`. */
export function WordingPanel({ draft, ctx, onChange }: Props): React.JSX.Element {
  const [termRows, setTermRows] = useState<TermRow[]>(() => termRowsOf(draft.terms));
  // A change from outside (the record arriving after mount, a template chosen) replaces the rows; the panel's own edits leave them.
  useEffect(() => {
    if (JSON.stringify(termsOf(termRows)) !== JSON.stringify(draft.terms)) setTermRows(termRowsOf(draft.terms));
  }, [draft.terms]);
  const listedIssues = useMemo(() => blockIssuesOf(draft.body, ctx), [draft.body, ctx]);
  const issueByKey = useMemo(() => new Map(ctx.issues.map((i) => [i.key, i])), [ctx.issues]);
  const listedKeys = listedIssues.map((i) => i.key);
  const listedKeySet = new Set(listedKeys);
  const orphanNoteKeys = Object.keys(draft.issueNotes).filter((k) => !listedKeySet.has(k));
  const noteKeys = [...listedKeys, ...orphanNoteKeys];

  const updateTermRows = (next: TermRow[]): void => {
    setTermRows(next);
    onChange({ terms: termsOf(next), issueNotes: draft.issueNotes });
  };

  const updateNote = (key: string, patch: Partial<IssueNote>): void => {
    const next = { ...(draft.issueNotes[key] ?? EMPTY_NOTE), ...patch };
    const { [key]: _dropped, ...rest } = draft.issueNotes;
    const issueNotes = next.summary.trim() === "" && next.note.trim() === "" ? rest : { ...rest, [key]: next };
    onChange({ terms: termsOf(termRows), issueNotes });
  };

  return (
    <div className="wording-panel">
      <h2>用語の言い換え</h2>
      <table className="issue-table wording-panel__table">
        <thead>
          <tr>
            <th className="issue-table__header">元の用語</th>
            <th className="issue-table__header">レポートでの用語</th>
            <th className="issue-table__header" />
          </tr>
        </thead>
        <tbody>
          {termRows.map((r, i) => (
            <tr key={i} className="issue-table__row">
              <td className="issue-table__cell">
                <input
                  className="issue-form__control"
                  aria-label="元の用語"
                  value={r.from}
                  onChange={(e) => updateTermRows(termRows.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                />
              </td>
              <td className="issue-table__cell">
                <input
                  className="issue-form__control"
                  aria-label="レポートでの用語"
                  value={r.to}
                  onChange={(e) => updateTermRows(termRows.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                />
              </td>
              <td className="issue-table__cell">
                <button type="button" onClick={() => updateTermRows(termRows.filter((_, j) => j !== i))}>
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="form-actions">
        <button type="button" onClick={() => updateTermRows([...termRows, { from: "", to: "" }])}>
          行を追加
        </button>
      </div>
      <h2>課題ごとの言い換え</h2>
      <table className="issue-table wording-panel__table">
        <thead>
          <tr>
            <th className="issue-table__header">キー</th>
            <th className="issue-table__header">件名</th>
            <th className="issue-table__header">レポートでの件名</th>
            <th className="issue-table__header">補足</th>
          </tr>
        </thead>
        <tbody>
          {noteKeys.map((key) => {
            const note = draft.issueNotes[key] ?? EMPTY_NOTE;
            return (
              <tr key={key} className="issue-table__row">
                <td className="issue-table__cell issue-table__cell--key">{key}</td>
                <td className="issue-table__cell">{issueByKey.get(key)?.summary ?? ""}</td>
                <td className="issue-table__cell">
                  <input
                    className="issue-form__control"
                    aria-label="レポートでの件名"
                    value={note.summary}
                    onChange={(e) => updateNote(key, { summary: e.target.value })}
                  />
                </td>
                <td className="issue-table__cell">
                  <input className="issue-form__control" aria-label="補足" value={note.note} onChange={(e) => updateNote(key, { note: e.target.value })} />
                </td>
              </tr>
            );
          })}
          {noteKeys.length === 0 && (
            <tr className="issue-table__row">
              <td colSpan={4} className="issue-table__cell text--muted">
                {M.noIssues}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
