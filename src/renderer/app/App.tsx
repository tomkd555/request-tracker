import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LOCAL_SETTINGS, type LocalConfig, type Project, type User } from "../../shared/types";
import { nextStep, type BootStep } from "./boot";
import { FirstLaunch } from "./FirstLaunch";
import { Nav } from "./Nav";
import { ProjectSettings } from "./ProjectSettings";
import { Settings } from "./Settings";
import { applyAppearance } from "./theme";
import { ToastRegion } from "./ToastRegion";
import { SessionContext, useSession } from "./SessionContext";
import { useHashRoute, type Route } from "./useHashRoute";
import { IssueCreate } from "../issues/IssueCreate";
import { IssueImport } from "../issues/IssueImport";
import { IssueDetail } from "../issues/IssueDetail";
import { IssueList } from "../issues/IssueList";
import { IssuesProvider, useIssues } from "../issues/useIssues";
import { Summary } from "../issues/Summary";
import { Gantt } from "../gantt/Gantt";
import { Kanban } from "../kanban/Kanban";
import { WikiFrame } from "../wiki/WikiFrame";
import { useWiki, WikiProvider } from "../wiki/useWiki";
import { Search } from "../search/Search";
import { NoticeList } from "../issues/NoticeList";
import { RecentList } from "./RecentList";
import { ReportEdit } from "../reports/ReportEdit";
import { ReportList } from "../reports/ReportList";
import { ReportView } from "../reports/ReportView";
import { ReportsProvider, useReports } from "../reports/useReports";
import "./app.css";
import "../issues/issues.css";
import { errorMessage, hasErrorCode, M } from "../messages";

/** What the window shows: a first-launch step, or the app once the folder, the project and the member are known. */
type BootState =
  | { step: Exclude<BootStep, "ready">; users: User[]; error: string | null }
  | { step: "ready"; config: LocalConfig; project: Project; me: User; users: User[] };

export function App(): React.JSX.Element {
  const [boot, setBoot] = useState<BootState | null>(null);

  const loadBootState = useCallback(async () => {
    let config: LocalConfig | null = null;
    try {
      config = await window.api.config.get();
      applyAppearance(config ?? DEFAULT_LOCAL_SETTINGS);
      if (config === null) {
        setBoot({ step: "folder", users: [], error: null });
        return;
      }
      // config.get has set the layout in main, so the three reads can go out together
      const [project, me, users] = await Promise.all([window.api.project.get(), window.api.users.me(), window.api.users.list()]);
      const step = nextStep(config, project, me);
      // nextStep returns "ready" only when the project and the member both exist.
      setBoot(step === "ready" ? { step, config, project: project!, me: me!, users } : { step, users, error: null });
    } catch (e) {
      // the share is unreachable (VPN down, drive offline), or its project.json is unreadable: let the user pick the folder again
      const rootDir = config?.rootDir ?? null;
      const error = hasErrorCode(e, "project-invalid") ? M.projectInvalidAt(rootDir) : M.shareUnreachableAt(rootDir);
      setBoot({ step: "folder", users: [], error });
    }
  }, []);

  useEffect(() => {
    void loadBootState();
  }, [loadBootState]);

  const refreshUsers = useCallback(async (): Promise<void> => {
    const [users, me] = await Promise.all([window.api.users.list(), window.api.users.me()]);
    setBoot((b) => (b?.step === "ready" ? { ...b, users, me: me ?? b.me } : b));
  }, []);

  const refreshProject = useCallback(async (): Promise<void> => {
    const project = await window.api.project.get();
    if (project !== null) setBoot((b) => (b?.step === "ready" ? { ...b, project } : b));
  }, []);

  const refreshConfig = useCallback(async (): Promise<void> => {
    const config = await window.api.config.get();
    if (config !== null) setBoot((b) => (b?.step === "ready" ? { ...b, config } : b));
  }, []);

  if (boot === null) return <div className="text--loading">読み込み中</div>;
  if (boot.step !== "ready") return <FirstLaunch step={boot.step} users={boot.users} onDone={loadBootState} error={boot.error} />;
  return (
    <SessionContext.Provider value={{ me: boot.me, users: boot.users, project: boot.project, config: boot.config, refreshUsers, refreshProject, refreshConfig }}>
      <IssuesProvider>
        <WikiProvider>
          <ReportsProvider>
            <Shell />
          </ReportsProvider>
        </WikiProvider>
      </IssuesProvider>
    </SessionContext.Provider>
  );
}

/** Nothing runs in the background: the share is read when a screen opens, after a save, and on 更新. */
function Shell(): React.JSX.Element {
  const route = useHashRoute();
  const { refreshUsers, refreshProject } = useSession();
  const issues = useIssues();
  const wiki = useWiki();
  const reports = useReports();
  const [error, setError] = useState<string | null>(null);
  const refreshAll = useCallback(async (): Promise<void> => {
    try {
      await Promise.all([refreshUsers(), refreshProject(), issues.reload(), wiki.reload(), reports.reload()]);
      setError(null);
    } catch (e) {
      // The share dropped mid-session: the screens keep what they read, and the message says so until a refresh succeeds.
      setError(M.shareUnreadable(errorMessage(e)));
    }
  }, [refreshUsers, refreshProject, issues.reload, wiki.reload, reports.reload]);
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false; // loadBootState has just read the same records; the issues, pages and reports still need their first read
      void Promise.all([issues.reload(), wiki.reload(), reports.reload()]).catch(() => void refreshAll());
      return;
    }
    void refreshAll();
  }, [refreshAll, route.path, issues.reload, wiki.reload, reports.reload]);
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
  if (path.startsWith("/wiki")) return <WikiFrame route={route} />;
  if (path.startsWith("/kanban")) return <Kanban />;
  if (path.startsWith("/gantt")) return <Gantt />;
  if (path.startsWith("/summary")) return <Summary />;
  if (path.startsWith("/project")) return <ProjectSettings />;
  if (path.startsWith("/settings")) return <Settings />;
  if (path === "/issues/new") {
    return <IssueCreate key={query.get("parent") ?? query.get("copy") ?? ""} parentKey={query.get("parent")} copyFrom={query.get("copy")} />;
  }
  if (path === "/issues/import") return <IssueImport />;
  if (path.startsWith("/search")) return <Search />;
  if (path.startsWith("/notices")) return <NoticeList />;
  if (path.startsWith("/recent")) return <RecentList />;
  if (path === "/reports/new") return <ReportEdit key={query.get("from") ?? ""} id={null} from={query.get("from")} />;
  const reportMatch = /^\/reports\/([^/]+)(\/edit)?$/.exec(path);
  if (reportMatch) {
    const [, id, editSuffix] = reportMatch;
    return editSuffix ? <ReportEdit key={id} id={id} from={null} /> : <ReportView key={id} id={id} />;
  }
  if (path.startsWith("/reports")) return <ReportList />;
  const issueMatch = /^\/issues\/([^/]+)$/.exec(path);
  if (issueMatch) return <IssueDetail key={issueMatch[1]} issueKey={issueMatch[1]} />;
  return <IssueList />;
}
