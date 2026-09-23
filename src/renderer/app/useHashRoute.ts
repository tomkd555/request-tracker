import { useEffect, useRef, useState } from "react";
import { M } from "../messages";

export interface Route { path: string; query: URLSearchParams }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/issues";
  const [path, search = ""] = raw.split("?");
  return { path: path.startsWith("/") ? path : `/${path}`, query: new URLSearchParams(search) };
}

export function navigate(to: string): void {
  window.location.hash = to;
}

// Forms with unsaved changes, counted so two dirty sections on one screen keep the guard until both are saved.
let activeGuards = 0;
let restoring = false;

/** While `active`, leaving the route asks 「編集内容を破棄しますか」 and closing the window asks the browser's own question. */
export function useNavigationGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    activeGuards++;
    const onUnload = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      activeGuards--;
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [active]);
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const accepted = useRef(window.location.hash);
  useEffect(() => {
    // A refused change puts the hash back without touching the route, so the screen with the draft never unmounts.
    const onChange = (): void => {
      if (restoring) {
        restoring = false;
        return;
      }
      if (activeGuards > 0 && !window.confirm(M.confirmDiscard)) {
        restoring = true;
        window.location.hash = accepted.current;
        return;
      }
      accepted.current = window.location.hash;
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
