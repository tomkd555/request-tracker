import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOCAL_SETTINGS, type LocalConfig, type Project, type User } from "../../shared/types";
import { nextStep, type BootStep } from "./boot";
import { FirstLaunch } from "./FirstLaunch";
import { Nav } from "./Nav";
import { Settings } from "./Settings";
import { applyAppearance } from "./theme";
import { SessionContext } from "./UserContext";
import { useHashRoute, type Route } from "./useHashRoute";
import { IssueCreate } from "../issues/IssueCreate";
import { IssueDetail } from "../issues/IssueDetail";
import { IssueList } from "../issues/IssueList";
import { IssuesProvider } from "../issues/useIssues";
import { Summary } from "../issues/Summary";
import { Gantt } from "../gantt/Gantt";
import { WikiScreen } from "../wiki/WikiFrame";
import { WikiProvider } from "../wiki/useWiki";
import "./app.css";
import "../issues/issues.css";

interface Boot { step: BootStep; config: LocalConfig | null; project: Project | null; me: User | null; users: User[]; error: string | null }

export function App(): React.JSX.Element {
  const [boot, setBoot] = useState<Boot | null>(null);

  const load = useCallback(async () => {
    let config: LocalConfig | null = null;
    try {
      config = await window.api.config.get();
      applyAppearance(config ?? DEFAULT_LOCAL_SETTINGS);
      const project = config ? await window.api.project.get() : null;
      const me = project ? await window.api.users.me() : null;
      const users = project ? await window.api.users.list() : [];
      setBoot({ step: nextStep(config, project, me), config, project, me, users, error: null });
    } catch (e) {
      // the share is unreachable (VPN down, drive offline), or its project.json is unreadable: let the user pick the folder again
      const where = config ? `共有フォルダ（${config.rootDir}）` : "共有フォルダ";
      const invalid = e instanceof Error && e.message.includes("project-invalid");
      const error = invalid
        ? `${where}のproject.jsonを読めません。`
        : `${where}に接続できません。ネットワークドライブやVPNを確認してください。`;
      setBoot({ step: "folder", config, project: null, me: null, users: [], error });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshUsers = useCallback(async (): Promise<void> => {
    const [users, me] = await Promise.all([window.api.users.list(), window.api.users.me()]);
    setBoot((b) => (b ? { ...b, users, me: me ?? b.me } : b));
  }, []);

  const refreshProject = useCallback(async (): Promise<void> => {
    const project = await window.api.project.get();
    if (project !== null) setBoot((b) => (b ? { ...b, project } : b));
  }, []);

  const refreshConfig = useCallback(async (): Promise<void> => {
    const config = await window.api.config.get();
    if (config !== null) setBoot((b) => (b ? { ...b, config } : b));
  }, []);

  if (boot === null) return <div className="text--loading">読み込み中</div>;
  if (boot.step !== "ready" || boot.me === null || boot.project === null || boot.config === null) {
    return <FirstLaunch step={boot.step === "ready" ? "name" : boot.step} onDone={load} error={boot.error} />;
  }
  return (
    <Ready me={boot.me} users={boot.users} project={boot.project} config={boot.config} refreshUsers={refreshUsers} refreshProject={refreshProject} refreshConfig={refreshConfig}>
      <IssuesProvider>
        <WikiProvider>
          <Shell />
        </WikiProvider>
      </IssuesProvider>
    </Ready>
  );
}

type ReadyProps = {
  me: User;
  users: User[];
  project: Project;
  config: LocalConfig;
  refreshUsers(): Promise<void>;
  refreshProject(): Promise<void>;
  refreshConfig(): Promise<void>;
  children: React.ReactNode;
};

function Ready({ me, users, project, config, refreshUsers, refreshProject, refreshConfig, children }: ReadyProps): React.JSX.Element {
  useEffect(
    () =>
      window.api.onChanged((e) => {
        if (e.collection === "users") void refreshUsers();
        if (e.collection === "project") void refreshProject();
      }),
    [refreshUsers, refreshProject],
  );
  return (
    <SessionContext.Provider value={{ me, users, project, config, refreshUsers, refreshProject, refreshConfig }}>{children}</SessionContext.Provider>
  );
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
  if (path.startsWith("/wiki")) return <WikiScreen route={route} />;
  if (path.startsWith("/gantt")) return <Gantt />;
  if (path.startsWith("/summary")) return <Summary />;
  if (path.startsWith("/settings")) return <Settings />;
  if (path === "/issues/new") {
    return <IssueCreate key={query.get("parent") ?? query.get("copy") ?? ""} parentKey={query.get("parent")} copyFrom={query.get("copy")} />;
  }
  const m = /^\/issues\/([^/]+)$/.exec(path);
  if (m) return <IssueDetail key={m[1]} issueKey={m[1]} />;
  return <IssueList />;
}
