import { useState } from "react";
import type { WikiPage } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { formatDateTime } from "../issues/labels";
import { useWiki } from "./useWiki";
import { WikiHistory } from "./WikiHistory";

export function WikiView({ id }: { id: string }): React.JSX.Element {
  const { me, users } = useSession();
  const { byId, loaded, refreshOne } = useWiki();
  const [error, setError] = useState<string | null>(null);
  const page = byId.get(id);
  if (!loaded) return <div className="loading">読み込み中</div>;
  if (!page) return <p>ページは見つかりません。</p>;

  const restore = async (old: WikiPage): Promise<void> => {
    setError(null);
    try {
      await window.api.wiki.put({ ...page, title: old.title, body: old.body, updatedAt: new Date().toISOString(), updatedBy: me.username });
      await refreshOne(page.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (): Promise<void> => {
    if (!window.confirm(`${page.title} を削除しますか`)) return;
    try {
      await window.api.wiki.remove(page.id);
      await refreshOne(page.id);
      navigate("/wiki");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="issue-detail">
      <div className="section-head">
        <h1>{page.title}</h1>
        <div className="form-actions">
          <a className="button" href={`#/wiki/${page.id}/edit`}>
            編集
          </a>
          <button type="button" onClick={() => void remove()}>
            削除
          </button>
        </div>
      </div>
      <p className="muted">
        更新 {formatDateTime(page.updatedAt)} {displayNameOf(users, page.updatedBy)}
      </p>
      {error && <p className="error">{error}</p>}
      <Markdown source={page.body} />
      <section>
        <h2>履歴</h2>
        <WikiHistory pageId={page.id} version={page.updatedAt} onRestore={(old) => void restore(old)} />
      </section>
    </div>
  );
}
