import { useEffect, useRef, useState } from "react";
import type { IssueFilter, SavedFilter } from "../../shared/types";
import { useSession } from "../app/UserContext";
import { defaultFilter, EMPTY_FILTER } from "./filterIssues";
import { removeFilter, sameFilter, upsertFilter } from "./savedFilter";
import { errorMessage, M } from "../messages";

type Props = { filter: IssueFilter; onChange(f: IssueFilter): void };

/** Bookmarks a filter per machine, in config.json. Shown beside FilterBar on the list, kanban and gantt screens. */
export function SavedFilters({ filter, onChange }: Props): React.JSX.Element {
  const { config, project, refreshConfig } = useSession();
  const [selected, setSelected] = useState("");
  const [name, setName] = useState<string | null>(null); // the name typed after 保存; null while the field is closed
  const [error, setError] = useState<string | null>(null);
  const naming = name !== null;
  const opener = useRef<HTMLButtonElement>(null);
  const wasNaming = useRef(false);
  // The field unmounts with the focus inside it; the button that opened it takes the focus back.
  useEffect(() => {
    if (wasNaming.current && !naming) opener.current?.focus();
    wasNaming.current = naming;
  }, [naming]);
  const current = config.savedFilters.find((s) => s.name === selected) ?? null;
  const dirty = current !== null && !sameFilter(current.filter, filter);

  /** False when config.json could not be written; the reason shows beside the buttons. */
  const persist = async (savedFilters: SavedFilter[]): Promise<boolean> => {
    setError(null);
    try {
      await window.api.config.put({ ...config, savedFilters });
      await refreshConfig();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };

  const save = async (): Promise<void> => {
    const n = name?.trim();
    if (!n) return;
    if (config.savedFilters.some((s) => s.name === n) && !window.confirm(M.confirmOverwrite(n))) return;
    if (!(await persist(upsertFilter(config.savedFilters, n, filter)))) return;
    setSelected(n);
    setName(null);
  };

  const overwrite = async (): Promise<void> => {
    if (current === null) return;
    await persist(upsertFilter(config.savedFilters, current.name, filter));
  };

  const remove = async (): Promise<void> => {
    if (current === null) return;
    if (await persist(removeFilter(config.savedFilters, current.name))) setSelected("");
  };

  return (
    <div className="filter-bar saved-filters">
      <label className="filter-bar__field">
        検索条件
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            const s = config.savedFilters.find((f) => f.name === e.target.value);
            // A stage deleted since the bookmark was saved is dropped; a bookmark left with no stage opens on the default set.
            if (s) {
              const statuses = s.filter.statuses.filter((id) => project.statuses.some((x) => x.id === id));
              onChange({ ...EMPTY_FILTER, ...s.filter, statuses: statuses.length === 0 ? defaultFilter(project.statuses).statuses : statuses });
            }
          }}
        >
          <option value="">{M.selectPrompt}</option>
          {config.savedFilters.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name === selected && dirty ? `${s.name}（未保存）` : s.name}
            </option>
          ))}
        </select>
      </label>
      {name === null ? (
        <button type="button" ref={opener} onClick={() => setName("")}>
          保存
        </button>
      ) : (
        <>
          <input
            className="filter-bar__search"
            aria-label="保存する名前"
            placeholder="保存する名前"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setName(null);
            }}
          />
          <button type="button" disabled={name.trim() === ""} onClick={() => void save()}>
            保存
          </button>
          <button type="button" onClick={() => setName(null)}>
            キャンセル
          </button>
        </>
      )}
      <button type="button" disabled={!dirty} onClick={() => void overwrite()}>
        上書き
      </button>
      <button type="button" disabled={current === null} onClick={() => void remove()}>
        削除
      </button>
      {error && <span className="text--error">{error}</span>}
    </div>
  );
}
