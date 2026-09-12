import { useCallback, useEffect, useState } from "react";
import type { Comment } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { displayNameOf, useSession } from "../app/UserContext";
import { formatDateTime } from "./labels";

export function Comments({ issueKey }: { issueKey: string }): React.JSX.Element {
  const { me, users } = useSession();
  const [items, setItems] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setItems(await window.api.comments.list(issueKey)), [issueKey]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(
    () =>
      window.api.onChanged((e) => {
        if (e.collection === "comments" && e.id === issueKey) void load();
      }),
    [issueKey, load],
  );

  const post = async (): Promise<void> => {
    const body = draft.trim();
    if (body === "") return;
    setError(null);
    const createdAt = new Date().toISOString();
    try {
      await window.api.comments.add({ id: "", issueKey, author: me.username, body, createdAt });
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section>
      <h2>コメント</h2>
      {items.length === 0 ? (
        <p className="text--muted">コメントはありません</p>
      ) : (
        <ul className="comments">
          {items.map((c) => (
            <li key={c.id} className="comments__item">
              <div className="comments__head">
                <span className="comments__author">{displayNameOf(users, c.author)}</span>
                <span className="text--muted">{formatDateTime(c.createdAt)}</span>
              </div>
              <Markdown source={c.body} />
            </li>
          ))}
        </ul>
      )}
      <textarea className="comments__textarea" value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} placeholder="コメントを書く" />
      {error && <p className="text--error">{error}</p>}
      <div className="form-actions">
        <button type="button" disabled={draft.trim() === ""} onClick={() => void post()}>
          投稿
        </button>
      </div>
    </section>
  );
}
