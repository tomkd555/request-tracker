import { noticesOf } from "../issues/notices";
import { seenStamp } from "../issues/seen";
import { useIssues } from "../issues/useIssues";
import { useSession } from "./SessionContext";

const ITEMS: { path: string; label: string }[] = [
  { path: "/issues", label: "課題" },
  { path: "/notices", label: "お知らせ" },
  { path: "/kanban", label: "カンバン" },
  { path: "/wiki", label: "Wiki" },
  { path: "/search", label: "検索" },
  { path: "/gantt", label: "ガントチャート" },
  { path: "/recent", label: "最近の更新" },
  { path: "/summary", label: "集計" },
  { path: "/reports", label: "レポート" },
  { path: "/project", label: "プロジェクト設定" },
  { path: "/settings", label: "設定" },
];

export function Nav({ current, onRefresh }: { current: string; onRefresh(): Promise<void> }): React.JSX.Element {
  const { me, project } = useSession();
  const { issues, watched } = useIssues();
  const unseenCount = noticesOf(issues, watched, me.username, project.statuses, seenStamp).length;
  return (
    <nav className="nav" aria-label="主メニュー">
      <div className="nav__title">Request Tracker</div>
      <ul className="nav__list">
        {ITEMS.map((item) => (
          <li key={item.path}>
            <a href={`#${item.path}`} className={`nav__link${current.startsWith(item.path) ? " nav__link--active" : ""}`}>
              {item.label}
              {item.path === "/notices" && unseenCount > 0 && <span className="nav__badge">{unseenCount}</span>}
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
