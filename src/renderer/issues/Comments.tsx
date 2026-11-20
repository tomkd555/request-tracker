import { useCallback, useEffect, useRef, useState } from "react";
import type { Comment, Issue, IssueStatus } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { displayNameOf, useSession } from "../app/SessionContext";
import { useNavigationGuard } from "../app/useHashRoute";
import { changeEntries, type ChangeEntry } from "./diffVersions";
import { formatDateTime } from "./labels";
import { errorMessage, M } from "../messages";

interface Props {
  issue: Issue;
  /** Bumped by the detail after each save, so the change feed reloads. */
  saveCount: number;
  /** Saves the stage; false when it was not saved (the owner shows why, or the user cancelled). */
  saveStatus(status: IssueStatus): Promise<boolean>;
}

type FeedItem = { kind: "comment"; at: string; comment: Comment } | { kind: "change"; at: string; change: ChangeEntry };

/** Oldest first; ISO timestamps order correctly as text. */
const byTime = (a: FeedItem, b: FeedItem): number => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

export function Comments({ issue, saveCount, saveStatus }: Props): React.JSX.Element {
  const { me, users, project } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [showChanges, setShowChanges] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [error, setError] = useState<string | null>(null);
  const issueKey = issue.key;
  const nameOf = useCallback((u: string | null) => displayNameOf(users, u), [users]);

  // The newest comment read; a read that finishes after a newer one started, or after unmount, is dropped.
  const commentsRead = useRef(0);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [changesError, setChangesError] = useState<string | null>(null);
  const loadError = commentsError ?? changesError;

  const loadComments = useCallback(async () => {
    const read = ++commentsRead.current;
    try {
      const list = await window.api.comments.list(issueKey);
      if (read !== commentsRead.current) return;
      setComments(list);
      setCommentsError(null);
    } catch (e) {
      if (read === commentsRead.current) setCommentsError(errorMessage(e));
    }
  }, [issueKey]);
  const loadChanges = useCallback(
    async (isCurrent: () => boolean) => {
      try {
        const history = await window.api.issues.history(issueKey);
        // The record as stored: `issue` shows a deleted stage as the first stage, which would read as a status change.
        const stored = (await window.api.issues.get(issueKey)) ?? issue;
        if (!isCurrent()) return;
        setChanges(changeEntries(history, stored, nameOf, project.fields, project.statuses, project.milestones ?? []));
        setChangesError(null);
      } catch (e) {
        if (isCurrent()) setChangesError(errorMessage(e));
      }
    },
    [issueKey, issue, nameOf, project.fields, project.statuses, project.milestones],
  );

  useEffect(() => {
    void loadComments();
    return () => {
      commentsRead.current++;
    };
  }, [loadComments]);
  useEffect(() => {
    let isCurrent = true;
    void loadChanges(() => isCurrent);
    return () => {
      isCurrent = false;
    };
  }, [loadChanges, saveCount]);
  useEffect(() => setStatus(issue.status), [issue.status]);

  const statusChanged = status !== issue.status;
  const body = draft.trim();
  useNavigationGuard(body !== "" || statusChanged);

  const post = async (): Promise<void> => {
    if (posting) return; // a second click while the share is slow would write the comment twice
    setPosting(true);
    setError(null);
    try {
      if (statusChanged && !(await saveStatus(status))) return;
      if (body === "") return;
      const createdAt = new Date().toISOString();
      try {
        await window.api.comments.add({ id: "", issueKey, author: me.username, body, createdAt });
        setDraft("");
        await loadComments();
      } catch (e) {
        setError(errorMessage(e));
      }
    } finally {
      setPosting(false);
    }
  };

  const feed: FeedItem[] = [
    ...comments.map((c): FeedItem => ({ kind: "comment", at: c.createdAt, comment: c })),
    ...(showChanges ? changes.map((c): FeedItem => ({ kind: "change", at: c.at, change: c })) : []),
  ].sort(byTime);

  return (
    <section>
      <div className="section-head">
        <h2>コメント</h2>
        <div className="markdown-editor__tabs">
          <button type="button" className={showChanges ? "markdown-editor__tab--active" : ""} onClick={() => setShowChanges(true)}>
            すべて表示
          </button>
          <button type="button" className={showChanges ? "" : "markdown-editor__tab--active"} onClick={() => setShowChanges(false)}>
            コメントのみ
          </button>
        </div>
      </div>
      {loadError !== null && <p className="text--error">{loadError}</p>}
      {feed.length === 0 ? (
        loadError === null && <p className="text--muted">{M.noComments}</p>
      ) : (
        <ul className="comments">
          {feed.map((f) =>
            f.kind === "comment" ? (
              <li key={f.comment.id} className="comments__item">
                <div className="comments__head">
                  <span className="comments__author">{nameOf(f.comment.author)}</span>
                  <span className="text--muted">{formatDateTime(f.comment.createdAt)}</span>
                </div>
                <Markdown source={f.comment.body} />
              </li>
            ) : (
              <li key={`change-${f.change.at}-${f.change.by}`} className="comments__item comments__item--change">
                <div className="comments__head">
                  <span className="comments__author">{nameOf(f.change.by)}</span>
                  <span className="text--muted">{formatDateTime(f.change.at)}</span>
                </div>
                <ul className="comments__changes">
                  {f.change.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </li>
            ),
          )}
        </ul>
      )}
      <textarea className="comments__textarea" value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} placeholder="コメントを書く" />
      {error && <p className="text--error">{error}</p>}
      <div className="form-actions">
        <label className="filter-bar__field">
          状態
          <select aria-label="状態" value={status} onChange={(e) => setStatus(e.target.value as IssueStatus)}>
            {project.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={posting || (body === "" && !statusChanged)} onClick={() => void post()}>
          投稿
        </button>
      </div>
    </section>
  );
}
