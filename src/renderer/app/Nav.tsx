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
    <nav className="nav">
      <div className="nav-title">Request Tracker</div>
      <ul>
        {ITEMS.map((it) => (
          <li key={it.path}>
            <a href={`#${it.path}`} className={current.startsWith(it.path) ? "active" : ""}>
              {it.label}
            </a>
          </li>
        ))}
      </ul>
      <div className="nav-user">{me.displayName}</div>
    </nav>
  );
}
