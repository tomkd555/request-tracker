import { Markdown } from "../app/Markdown";
import { displayNameOf, useSession } from "../app/UserContext";
import { formatDateTime } from "../issues/labels";
import { useWiki } from "./useWiki";

export function WikiView({ id }: { id: string }): React.JSX.Element {
  const { users } = useSession();
  const { byId, loaded } = useWiki();
  const page = byId.get(id);
  if (!loaded) return <div className="loading">読み込み中</div>;
  if (!page) return <p>ページは見つかりません。</p>;

  return (
    <div className="issue-detail">
      <div className="section-head">
        <h1>{page.title}</h1>
        <div className="form-actions">
          <a className="button" href={`#/wiki/${page.id}/edit`}>
            編集
          </a>
        </div>
      </div>
      <p className="muted">
        更新 {formatDateTime(page.updatedAt)} {displayNameOf(users, page.updatedBy)}
      </p>
      <Markdown source={page.body} />
    </div>
  );
}
