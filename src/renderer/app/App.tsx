import { useCallback, useEffect, useState } from "react";
import type { Project, User } from "../../shared/types";
import { nextStep, type BootStep } from "./boot";
import { FirstLaunch } from "./FirstLaunch";
import { Nav } from "./Nav";
import { SessionContext } from "./UserContext";
import { useHashRoute } from "./useHashRoute";
import "./app.css";

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

  if (boot === null) return <div className="loading">読み込み中</div>;
  if (boot.step !== "ready" || boot.me === null || boot.project === null) {
    return <FirstLaunch step={boot.step === "ready" ? "name" : boot.step} onDone={load} />;
  }
  const refreshUsers = async (): Promise<void> => {
    const users = await window.api.users.list();
    setBoot((b) => (b ? { ...b, users } : b));
  };
  return (
    <SessionContext.Provider value={{ me: boot.me, users: boot.users, project: boot.project, refreshUsers }}>
      <Shell />
    </SessionContext.Provider>
  );
}

function Shell(): React.JSX.Element {
  const route = useHashRoute();
  return (
    <div className="shell">
      <Nav current={route.path} />
      <main className="content">
        <Screen path={route.path} />
      </main>
    </div>
  );
}

function Screen({ path }: { path: string }): React.JSX.Element {
  // Placeholders; the module tasks replace each branch.
  if (path.startsWith("/wiki")) return <h1>Wiki</h1>;
  if (path.startsWith("/gantt")) return <h1>ガントチャート</h1>;
  if (path.startsWith("/summary")) return <h1>集計</h1>;
  return <h1>課題</h1>;
}
