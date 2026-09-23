import { useEffect, useState } from "react";
import { fiscalYearOf, fiscalYy } from "../../shared/fiscalYear";
import type { WikiPage } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { useSession } from "../app/UserContext";
import { navigate, useNavigationGuard } from "../app/useHashRoute";
import { MarkdownEditor } from "../issues/FieldEditor";
import { useWiki } from "./useWiki";
import { descendantIdsOf, flattenTree, normalizeTitle } from "./wikiTree";
import { errorMessage, M } from "../messages";

interface Props {
  id: string | null;
  /** From `?title=` on a link to a page that does not exist yet. */
  presetTitle: string;
  /** From `?parent=` (子ページを追加, or the page a missing link was clicked on). */
  presetParent: string | null;
}

export function WikiEdit({ id, presetTitle, presetParent }: Props): React.JSX.Element {
  const { me, project } = useSession();
  const { pages, byId, loaded, refreshOne, reload } = useWiki();
  const issuePrefix = `${fiscalYy(fiscalYearOf(new Date(), project.fiscalYearStartMonth))}-`;
  const existing = id !== null ? byId.get(id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? presetTitle);
  const [body, setBody] = useState(existing?.body ?? "");
  const [parentId, setParentId] = useState<string | null>(existing?.parentId ?? presetParent);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // On a reload at #/wiki/<id>/edit the page arrives after the first render; take its content then.
  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setBody(existing.body);
      setParentId(existing.parentId);
    }
  }, [existing?.id]);

  const dirty = existing ? title !== existing.title || body !== existing.body || parentId !== existing.parentId : title !== presetTitle || body !== "";
  useNavigationGuard(dirty && !busy);

  if (id !== null && !loaded) return <div className="text--loading">読み込み中</div>;
  if (id !== null && !existing) return <p>ページが見つかりません。</p>;

  const excluded = id !== null ? descendantIdsOf(pages, id) : new Set<string>();
  const parentOptions = flattenTree(pages).filter((r) => !excluded.has(r.page.id));
  const titleMissing = title.trim() === "";
  const duplicate = pages.some((p) => p.id !== id && p.parentId === parentId && normalizeTitle(p.title) === normalizeTitle(title));

  const save = async (): Promise<void> => {
    setSubmitted(true);
    setError(null);
    if (titleMissing || duplicate) return;
    setBusy(true);
    const now = new Date().toISOString();
    try {
      if (existing) {
        const page: WikiPage = { ...existing, title: title.trim(), body, parentId, note: note.trim(), updatedAt: now, updatedBy: me.username };
        await window.api.wiki.put(page, existing.updatedAt);
        await refreshOne(page.id);
        navigate(`/wiki/${page.id}`);
      } else {
        const created = await window.api.wiki.create({ id: "", title: title.trim(), body, parentId, note: note.trim(), createdAt: now, createdBy: me.username, updatedAt: now, updatedBy: me.username });
        await reload();
        navigate(`/wiki/${created.id}`);
      }
    } catch (e) {
      setError(errorMessage(e, "wiki"));
      setBusy(false);
    }
  };

  return (
    <form
      className="issue-form wiki-form"
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
      <h1>{existing ? "ページの編集" : "新規ページ"}</h1>
      <div className="issue-form__grid wiki-form__grid">
        <label htmlFor="wiki-title" className="issue-form__term">
          タイトル
        </label>
        <div className="issue-form__cell">
          <input id="wiki-title" className="issue-form__control" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={submitted && (titleMissing || duplicate)} autoFocus />
          {submitted && titleMissing && <span className="issue-form__error">{M.titleRequired}</span>}
          {submitted && duplicate && <span className="issue-form__error">{M.duplicateTitle}</span>}
        </div>
        <label htmlFor="wiki-parent" className="issue-form__term">
          親ページ
        </label>
        <div className="issue-form__cell">
          <select id="wiki-parent" className="issue-form__control" value={parentId ?? ""} onChange={(e) => setParentId(e.target.value || null)}>
            <option value="">なし</option>
            {parentOptions.map(({ page: p, depth }) => (
              <option key={p.id} value={p.id}>
                {"  ".repeat(depth)}
                {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <MarkdownEditor value={body} onChange={setBody} preview={(v) => <Markdown source={v} demote={1} wikiParentId={id} />} rows={24} extraCommands={["wikiLink", "issueKey"]} issuePrefix={issuePrefix} ariaLabel="本文" />
      <label className="issue-form__field">
        変更内容
        <input className="issue-form__control" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </label>
      {error && <p className="text--error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={busy}>
          保存
        </button>
        <button type="button" onClick={() => navigate(existing ? `/wiki/${existing.id}` : parentId ? `/wiki/${parentId}` : "/wiki")}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
