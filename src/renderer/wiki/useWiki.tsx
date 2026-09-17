import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { WikiPage } from "../../shared/types";
import { titleIndex } from "./wikiTree";

export interface WikiState {
  pages: WikiPage[];
  byId: Map<string, WikiPage>;
  /** Normalized title -> id, for `[[タイトル]]` links. */
  titles: Map<string, string>;
  loaded: boolean;
  reload(): Promise<void>;
  refreshOne(id: string): Promise<void>;
}

export const WikiContext = createContext<WikiState | null>(null);

export function WikiProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [byId, setById] = useState<Map<string, WikiPage>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const list = await window.api.wiki.list();
    setById(new Map(list.map((p) => [p.id, p])));
    setLoaded(true);
  }, []);

  const refreshOne = useCallback(async (id: string) => {
    const page = await window.api.wiki.get(id);
    setById((m) => {
      const next = new Map(m);
      if (page === null) next.delete(id);
      else next.set(id, page);
      return next;
    });
  }, []);

  // No load here: the shell reads the share when a screen opens and on 更新 (see App.tsx).

  const value = useMemo<WikiState>(() => {
    const pages = [...byId.values()];
    return { pages, byId, titles: titleIndex(pages), loaded, reload, refreshOne };
  }, [byId, loaded, reload, refreshOne]);
  return <WikiContext.Provider value={value}>{children}</WikiContext.Provider>;
}

export function useWiki(): WikiState {
  const s = useContext(WikiContext);
  if (s === null) throw new Error("useWiki outside WikiProvider");
  return s;
}
