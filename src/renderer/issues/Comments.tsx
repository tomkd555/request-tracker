import { useCallback, useEffect, useState } from "react";
import { ISSUE_STATUSES, type Comment, type Issue, type IssueStatus } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { displayNameOf, useSession } from "../app/UserContext";
import { changeEntries, type ChangeEntry } from "./diffVersions";
import { formatDateTime, STATUS_LABEL } from "./labels";

interface Props {
  issue: Issue;
  /** Bumped by the detail after each save, so the change feed reloads. */
  version: number;
  /** Saves a new status; rejects on failure. */
  onStatus(status: IssueStatus): Promise<void>;
}

type FeedItem = { kind: "comment"; at: string; comment: Comment } | { kind: "change"; at: string; change: ChangeEntry };

export function Comments({ issue, version, onStatus }: Props): React.JSX.Element {
  const { me, users, project } = useSession();
  const [items, setItems] = useState<Comment[]>([]);
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [showChanges, setShowChanges] = useState(true);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [error, setError] = useState<string | null>(null);
  const issueKey = issue.key;
  const nameOf = useCallback((u: string | null) => displayNameOf(users, u), [users]);

  const load = useCallback(async () => setItems(await window.api.comments.list(issueKey)), [issueKey]);
  const loadChanges = useCallback(async () => {
    const history = await window.api.issues.history(issueKey);
    setChanges(changeEntries(history, issue, nameOf, project.fields));
  }, [issueKey, issue, nameOf, project.fields]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadChanges();
  }, [loadChanges, version]);
  useEffect(() => setStatus(issue.status), [issue.status]);
  useEffect(
    () =>
      window.api.onChanged((e) => {
        if (e.collection === "comments" && e.id === issueKey) void load();
      }),
    [issueKey, load],
  );

  const statusChanged = status !== issue.status;
  const body = draft.trim();

  const post = async (): Promise<void> => {
    setError(null);
    try {
      if (statusChanged) await onStatus(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (body === "") return;
    const createdAt = new Date().toISOString();
    try {
      await window.api.comments.add({ id: "", issueKey, author: me.username, body, createdAt });
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const feed: FeedItem[] = [
    ...items.map((c): FeedItem => ({ kind: "comment", at: c.createdAt, comment: c })),
    ...(showChanges ? changes.map((c): FeedItem => ({ kind: "change", at: c.at, change: c })) : []),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

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
      {feed.length === 0 ? (
        <p className="text--muted">コメントはありません</p>
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
            {ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={body === "" && !statusChanged} onClick={() => void post()}>
          投稿
        </button>
      </div>
    </section>
  );
}
