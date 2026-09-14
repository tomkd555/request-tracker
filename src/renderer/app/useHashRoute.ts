import { useEffect, useRef, useState } from "react";

export interface Route { path: string; query: URLSearchParams }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/issues";
  const [path, search = ""] = raw.split("?");
  return { path: path.startsWith("/") ? path : `/${path}`, query: new URLSearchParams(search) };
}

export function navigate(to: string): void {
  window.location.hash = to;
}

/** Returns false to keep the current screen; set by a form with unsaved changes. */
type Guard = () => boolean;
let guard: Guard | null = null;
let restoring = false;

/** While `active`, leaving the route asks 「編集内容を破棄しますか」 and closing the window asks the browser's own question. */
export function useNavigationGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    guard = () => window.confirm("編集内容を破棄しますか");
    const onUnload = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      guard = null;
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
      if (guard !== null && !guard()) {
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
