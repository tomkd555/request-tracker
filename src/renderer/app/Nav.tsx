import { useSession } from "./UserContext";

const ITEMS: { path: string; label: string }[] = [
  { path: "/issues", label: "課題" },
  { path: "/wiki", label: "Wiki" },
  { path: "/gantt", label: "ガントチャート" },
  { path: "/summary", label: "集計" },
];

export function Nav({ current }: { current: string }): React.JSX.Element {
  const { me } = useSession();
  return (
    <nav className="nav" aria-label="主メニュー">
      <div className="nav__title">Request Tracker</div>
      <ul className="nav__list">
        {ITEMS.map((it) => (
          <li key={it.path}>
            <a href={`#${it.path}`} className={`nav__link${current.startsWith(it.path) ? " nav__link--active" : ""}`}>
              {it.label}
            </a>
          </li>
        ))}
      </ul>
      <div className="nav__user">{me.displayName}</div>
    </nav>
  );
}
