import { unseenMine } from "../issues/seen";
import { useIssues } from "../issues/useIssues";
import { useSession } from "./UserContext";

const ITEMS: { path: string; label: string }[] = [
  { path: "/issues", label: "課題" },
  { path: "/wiki", label: "Wiki" },
  { path: "/gantt", label: "ガントチャート" },
  { path: "/summary", label: "集計" },
  { path: "/settings", label: "設定" },
];

export function Nav({ current }: { current: string }): React.JSX.Element {
  const { me } = useSession();
  const { issues } = useIssues();
  const unseen = unseenMine(issues, me.username);
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
      <div className="nav__user">{me.displayName}</div>
    </nav>
  );
}
