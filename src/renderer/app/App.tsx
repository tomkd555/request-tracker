import { useCallback, useEffect, useState } from "react";
import type { Project, User } from "../../shared/types";
import { nextStep, type BootStep } from "./boot";
import { FirstLaunch } from "./FirstLaunch";
import { Nav } from "./Nav";
import { SessionContext } from "./UserContext";
import { useHashRoute, type Route } from "./useHashRoute";
import { IssueCreate } from "../issues/IssueCreate";
import { IssueDetail } from "../issues/IssueDetail";
import { IssueList } from "../issues/IssueList";
import { IssuesProvider } from "../issues/useIssues";
import { Summary } from "../issues/Summary";
import { Gantt } from "../gantt/Gantt";
import { WikiEdit } from "../wiki/WikiEdit";
import { WikiList } from "../wiki/WikiList";
import { WikiView } from "../wiki/WikiView";
import { WikiProvider } from "../wiki/useWiki";
import "./app.css";
import "../issues/issues.css";

type Boot = { step: BootStep; project: Project | null; me: User | null; users: User[] };

export function App(): React.JSX.Element {
  const [boot, setBoot] = useState<Boot | null>(null);

  const load = useCallback(async () => {
    const config = await window.api.config.get();
    const project = config ? await window.api.project.get() : null;
    const me = project ? await window.api.users.me() : null;
    const users = project ? await window.api.users.list() : [];
    setBoot({ step: nextStep(config, project, me), project, me, users });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshUsers = useCallback(async (): Promise<void> => {
    const users = await window.api.users.list();
    setBoot((b) => (b ? { ...b, users } : b));
  }, []);

  if (boot === null) return <div className="text--loading">読み込み中</div>;
  if (boot.step !== "ready" || boot.me === null || boot.project === null) {
    return <FirstLaunch step={boot.step === "ready" ? "name" : boot.step} onDone={load} />;
  }
  return (
    <Ready me={boot.me} users={boot.users} project={boot.project} refreshUsers={refreshUsers}>
      <IssuesProvider>
        <WikiProvider>
          <Shell />
        </WikiProvider>
      </IssuesProvider>
    </Ready>
  );
}

type ReadyProps = { me: User; users: User[]; project: Project; refreshUsers(): Promise<void>; children: React.ReactNode };

function Ready({ me, users, project, refreshUsers, children }: ReadyProps): React.JSX.Element {
  useEffect(
    () =>
      window.api.onChanged((e) => {
        if (e.collection === "users") void refreshUsers();
      }),
    [refreshUsers],
  );
  return <SessionContext.Provider value={{ me, users, project, refreshUsers }}>{children}</SessionContext.Provider>;
}

function Shell(): React.JSX.Element {
  const route = useHashRoute();
  return (
    <div className="shell">
      <Nav current={route.path} />
      <main className="shell__content">
        <Screen route={route} />
      </main>
    </div>
  );
}

function Screen({ route }: { route: Route }): React.JSX.Element {
  const { path, query } = route;
  if (path === "/wiki/new") return <WikiEdit key="new" id={null} />;
  const w = /^\/wiki\/([^/]+)(\/edit)?$/.exec(path);
  if (w) return w[2] ? <WikiEdit key={w[1]} id={w[1]} /> : <WikiView key={w[1]} id={w[1]} />;
  if (path.startsWith("/wiki")) return <WikiList />;
  if (path.startsWith("/gantt")) return <Gantt />;
  if (path.startsWith("/summary")) return <Summary />;
  if (path === "/issues/new") return <IssueCreate key={query.get("parent") ?? ""} parentKey={query.get("parent")} />;
  const m = /^\/issues\/([^/]+)$/.exec(path);
  if (m) return <IssueDetail key={m[1]} issueKey={m[1]} />;
  return <IssueList />;
}
