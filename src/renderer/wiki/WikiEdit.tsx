import { useState } from "react";
import type { WikiPage } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { useWiki } from "./useWiki";

export function WikiEdit({ id }: { id: string | null }): React.JSX.Element {
  const { me } = useSession();
  const { byId, loaded, refreshOne, reload } = useWiki();
  const existing = id !== null ? byId.get(id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (id !== null && !loaded) return <div className="loading">読み込み中</div>;
  if (id !== null && !existing) return <p>ページは見つかりません。</p>;

  const save = async (): Promise<void> => {
    if (title.trim() === "") return;
    setBusy(true);
    setError(null);
    const now = new Date().toISOString();
    try {
      if (existing) {
        const page: WikiPage = { ...existing, title: title.trim(), body, updatedAt: now, updatedBy: me.username };
        await window.api.wiki.put(page);
        await refreshOne(page.id);
        navigate(`/wiki/${page.id}`);
      } else {
        await window.api.wiki.create({ id: "", title: title.trim(), body, createdAt: now, createdBy: me.username, updatedAt: now, updatedBy: me.username });
        await reload();
        navigate("/wiki");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    >
      <h1>{existing ? "ページの編集" : "新規ページ"}</h1>
      <label>
        タイトル
        <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      </label>
      <div className="tabs">
        <button type="button" className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>
          編集
        </button>
        <button type="button" className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>
          プレビュー
        </button>
      </div>
      {tab === "edit" ? (
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={20} />
      ) : (
        <div className="markdown-view">
          <Markdown source={body} />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy || title.trim() === ""}>
          保存
        </button>
        <button type="button" onClick={() => navigate(existing ? `/wiki/${existing.id}` : "/wiki")}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
