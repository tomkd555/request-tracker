import { useEffect, useRef, useState } from "react";
import { fiscalYearOf, fiscalYy } from "../../shared/fiscalYear";
import type { WikiPage } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { useSession } from "../app/SessionContext";
import { navigate, useNavigationGuard } from "../app/useHashRoute";
import { MarkdownEditor } from "../issues/FieldEditor";
import { useWiki } from "./useWiki";
import { flattenTree, hasDuplicateTitle, subtreeIdsOf } from "./wikiTree";
import { errorMessage, isStale, M } from "../messages";

interface Props {
  id: string | null;
  /** From `?title=` on a link to a page that does not exist yet. */
  presetTitle: string;
  /** From `?parent=` (子ページを追加, or the page a missing link was clicked on). */
  presetParent: string | null;
}

export function WikiEdit({ id, presetTitle, presetParent }: Props): React.JSX.Element {
  const { me, project } = useSession();
  const { pages, byId, isLoaded, refreshOne, reload } = useWiki();
  const issuePrefix = `${fiscalYy(fiscalYearOf(new Date(), project.fiscalYearStartMonth))}-`;
  const existing = id !== null ? byId.get(id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? presetTitle);
  const [body, setBody] = useState(existing?.body ?? "");
  const [parentId, setParentId] = useState<string | null>(existing?.parentId ?? presetParent);
  const [note, setNote] = useState("");
  const [wasSubmitted, setWasSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [canReloadDraft, setCanReloadDraft] = useState(false);
  const [refillCount, setRefillCount] = useState(0);
  const baseUpdatedAt = useRef<string | null>(null); // the stamp the draft was filled from; a re-read of the list mid-edit must not move it

  // On a reload at #/wiki/<id>/edit the page arrives after the first render; take its content then. 再読み込み takes it again.
  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setBody(existing.body);
      setParentId(existing.parentId);
      baseUpdatedAt.current = existing.updatedAt;
    }
  }, [existing?.id, refillCount]);

  const isDirty = existing ? title !== existing.title || body !== existing.body || parentId !== existing.parentId : title !== presetTitle || body !== "";
  useNavigationGuard(isDirty && !isSaving);

  if (id !== null && !isLoaded) return <div className="text--loading">読み込み中</div>;
  if (id !== null && !existing) return <p>ページが見つかりません</p>;

  const ownSubtreeIds = id !== null ? subtreeIdsOf(pages, id) : new Set<string>();
  const parentOptions = flattenTree(pages).filter((r) => !ownSubtreeIds.has(r.page.id));
  const isTitleMissing = title.trim() === "";
  const isDuplicateTitle = hasDuplicateTitle(pages, id, title);
  const cancelPath = existing ? `/wiki/${existing.id}` : parentId ? `/wiki/${parentId}` : "/wiki";

  const reloadDraft = async (): Promise<void> => {
    if (id === null || !window.confirm(M.confirmDiscard)) return;
    setError(null);
    setCanReloadDraft(false);
    try {
      await refreshOne(id);
      setRefillCount((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e, "wiki"));
    }
  };

  const save = async (): Promise<void> => {
    setWasSubmitted(true);
    setError(null);
    setCanReloadDraft(false);
    if (isTitleMissing || isDuplicateTitle) return;
    setIsSaving(true);
    const now = new Date().toISOString();
    try {
      if (existing) {
        const page: WikiPage = { ...existing, title: title.trim(), body, parentId, note: note.trim(), updatedAt: now, updatedBy: me.username };
        await window.api.wiki.put(page, baseUpdatedAt.current ?? existing.updatedAt);
        await refreshOne(page.id);
        navigate(`/wiki/${page.id}`);
      } else {
        const created = await window.api.wiki.create({ id: "", title: title.trim(), body, parentId, note: note.trim(), createdAt: now, createdBy: me.username, updatedAt: now, updatedBy: me.username });
        await reload();
        navigate(`/wiki/${created.id}`);
      }
    } catch (e) {
      setError(errorMessage(e, "wiki"));
      setCanReloadDraft(isStale(e));
      setIsSaving(false);
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
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isSaving) {
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
          <input id="wiki-title" className="issue-form__control" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={wasSubmitted && (isTitleMissing || isDuplicateTitle)} autoFocus />
          {wasSubmitted && isTitleMissing && <span className="issue-form__error">{M.titleRequired}</span>}
          {wasSubmitted && isDuplicateTitle && <span className="issue-form__error">{M.duplicateTitle}</span>}
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
      {error && (
        <p className="text--error">
          {error}
          {canReloadDraft && (
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
        <button type="button" onClick={() => navigate(cancelPath)}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
