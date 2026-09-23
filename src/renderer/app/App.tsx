import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LOCAL_SETTINGS, type LocalConfig, type Project, type User } from "../../shared/types";
import { nextStep, type BootStep } from "./boot";
import { FirstLaunch } from "./FirstLaunch";
import { Nav } from "./Nav";
import { ProjectSettings } from "./ProjectSettings";
import { Settings } from "./Settings";
import { applyAppearance } from "./theme";
import { ToastRegion } from "./ToastRegion";
import { SessionContext, useSession } from "./UserContext";
import { useHashRoute, type Route } from "./useHashRoute";
import { IssueCreate } from "../issues/IssueCreate";
import { IssueDetail } from "../issues/IssueDetail";
import { IssueList } from "../issues/IssueList";
import { IssuesProvider, useIssues } from "../issues/useIssues";
import { Summary } from "../issues/Summary";
import { Gantt } from "../gantt/Gantt";
import { Kanban } from "../kanban/Kanban";
import { WikiScreen } from "../wiki/WikiFrame";
import { useWiki, WikiProvider } from "../wiki/useWiki";
import { Search } from "../search/Search";
import "./app.css";
import "../issues/issues.css";
import { M } from "../messages";

interface Boot { step: BootStep; config: LocalConfig | null; project: Project | null; me: User | null; users: User[]; error: string | null }

export function App(): React.JSX.Element {
  const [boot, setBoot] = useState<Boot | null>(null);

  const load = useCallback(async () => {
    let config: LocalConfig | null = null;
    try {
      config = await window.api.config.get();
      applyAppearance(config ?? DEFAULT_LOCAL_SETTINGS);
      // config.get has set the layout in main, so the three reads can go out together
      const [project, me, users] = config ? await Promise.all([window.api.project.get(), window.api.users.me(), window.api.users.list()]) : [null, null, []];
      setBoot({ step: nextStep(config, project, project ? me : null), config, project, me: project ? me : null, users: project ? users : [], error: null });
    } catch (e) {
      // the share is unreachable (VPN down, drive offline), or its project.json is unreadable: let the user pick the folder again
      const where = config ? `共有フォルダ（${config.rootDir}）` : "共有フォルダ";
      const invalid = e instanceof Error && e.message.includes("project-invalid");
      const error = invalid
        ? M.projectInvalidAt(where)
        : M.shareUnreachableAt(where);
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
    return <FirstLaunch step={boot.step === "ready" ? "name" : boot.step} users={boot.users} onDone={load} error={boot.error} />;
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
  return (
    <SessionContext.Provider value={{ me, users, project, config, refreshUsers, refreshProject, refreshConfig }}>{children}</SessionContext.Provider>
  );
}

/** Nothing runs in the background: the share is read when a screen opens, after a save, and on 更新. */
function Shell(): React.JSX.Element {
  const route = useHashRoute();
  const { refreshUsers, refreshProject } = useSession();
  const issues = useIssues();
  const wiki = useWiki();
  const [error, setError] = useState<string | null>(null);
  const refreshAll = useCallback(async (): Promise<void> => {
    try {
      await Promise.all([refreshUsers(), refreshProject(), issues.reload(), wiki.reload()]);
      setError(null);
    } catch (e) {
      // The share dropped mid-session: the screens keep what they read, and the message says so until a refresh succeeds.
      setError(M.shareUnreadable(e instanceof Error ? e.message : String(e)));
    }
  }, [refreshUsers, refreshProject, issues.reload, wiki.reload]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // App.load has just read the same records; the issues and pages still need their first read
      void Promise.all([issues.reload(), wiki.reload()]).catch(() => void refreshAll());
      return;
    }
    void refreshAll();
  }, [refreshAll, route.path, issues.reload, wiki.reload]);
  return (
    <div className="shell">
      <Nav current={route.path} onRefresh={refreshAll} />
      <main className="shell__content">
        {error && (
          <p className="text--error" role="alert">
            {error}
          </p>
        )}
        <Screen route={route} />
      </main>
      <ToastRegion />
    </div>
  );
}

function Screen({ route }: { route: Route }): React.JSX.Element {
  const { path, query } = route;
  if (path.startsWith("/wiki")) return <WikiScreen route={route} />;
  if (path.startsWith("/kanban")) return <Kanban />;
  if (path.startsWith("/gantt")) return <Gantt />;
  if (path.startsWith("/summary")) return <Summary />;
  if (path.startsWith("/project")) return <ProjectSettings />;
  if (path.startsWith("/settings")) return <Settings />;
  if (path === "/issues/new") {
    return <IssueCreate key={query.get("parent") ?? query.get("copy") ?? ""} parentKey={query.get("parent")} copyFrom={query.get("copy")} />;
  }
  if (path.startsWith("/search")) return <Search />;
  const m = /^\/issues\/([^/]+)$/.exec(path);
  if (m) return <IssueDetail key={m[1]} issueKey={m[1]} />;
  return <IssueList />;
}
