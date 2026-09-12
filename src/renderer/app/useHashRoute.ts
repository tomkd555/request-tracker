import { useEffect, useState } from "react";

export type Route = { path: string; query: URLSearchParams };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/issues";
  const [path, search = ""] = raw.split("?");
  return { path: path.startsWith("/") ? path : `/${path}`, query: new URLSearchParams(search) };
}

export function navigate(to: string): void {
  window.location.hash = to;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
