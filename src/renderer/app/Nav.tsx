import { unseenMine } from "../issues/seen";
import { useIssues } from "../issues/useIssues";
import { useSession } from "./UserContext";

const ITEMS: { path: string; label: string }[] = [
  { path: "/issues", label: "課題" },
  { path: "/kanban", label: "カンバン" },
  { path: "/wiki", label: "Wiki" },
  { path: "/search", label: "検索" },
  { path: "/gantt", label: "ガントチャート" },
  { path: "/summary", label: "集計" },
  { path: "/reports", label: "レポート" },
  { path: "/project", label: "プロジェクト設定" },
  { path: "/settings", label: "設定" },
];

export function Nav({ current, onRefresh }: { current: string; onRefresh(): Promise<void> }): React.JSX.Element {
  const { me, project } = useSession();
  const { issues } = useIssues();
  const unseen = unseenMine(issues, me.username, project.statuses);
  return (
    <nav className="nav" aria-label="主メニュー">
      <div className="nav__title">Request Tracker</div>
      <ul className="nav__list">
        {ITEMS.map((it) => (
          <li key={it.path}>
            <a href={`#${it.path}`} className={`nav__link${current.startsWith(it.path) ? " nav__link--active" : ""}`}>
              {it.label}
              {it.path === "/issues" && unseen > 0 && <span className="nav__badge">{unseen}</span>}
            </a>
          </li>
        ))}
      </ul>
      <button type="button" className="nav__link nav__link--button" onClick={() => void onRefresh()}>
        更新
      </button>
      <div className="nav__user">{me.displayName}</div>
    </nav>
  );
}
