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
let activeGuardCount = 0;
let isRestoringHash = false;
let isDiscarding = false;

/** True while a form on the screen holds unsaved changes. */
export const hasUnsavedChanges = (): boolean => activeGuardCount > 0;

/** Reloads the window past the guards, for a caller that has asked 「編集内容を破棄しますか」 itself. */
export function reloadDiscarding(): void {
  isDiscarding = true;
  window.location.reload();
}

/** While `active`, leaving the route asks 「編集内容を破棄しますか」, and closing the window has the main process ask the same (will-prevent-unload in main/index.ts). */
export function useNavigationGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    activeGuardCount++;
    const onUnload = (e: BeforeUnloadEvent): void => {
      if (!isDiscarding) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      activeGuardCount--;
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [active]);
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const acceptedHash = useRef(window.location.hash);
  useEffect(() => {
    // A refused change puts the hash back without touching the route, so the screen with the draft never unmounts.
    const onChange = (): void => {
      if (isRestoringHash) {
        isRestoringHash = false;
        return;
      }
      if (activeGuardCount > 0 && !window.confirm(M.confirmDiscard)) {
        isRestoringHash = true;
        window.location.hash = acceptedHash.current;
        return;
      }
      acceptedHash.current = window.location.hash;
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
