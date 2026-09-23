import { useState } from "react";
import type { IssueFilter, SavedFilter } from "../../shared/types";
import { useSession } from "../app/UserContext";
import { defaultFilter, EMPTY_FILTER } from "./filterIssues";
import { removeFilter, sameFilter, upsertFilter } from "./savedFilter";
import { M } from "../messages";

type Props = { filter: IssueFilter; onChange(f: IssueFilter): void };

/** Bookmarks a filter per machine, in config.json. Shown beside FilterBar on the list, kanban and gantt screens. */
export function SavedFilters({ filter, onChange }: Props): React.JSX.Element {
  const { config, project, refreshConfig } = useSession();
  const [selected, setSelected] = useState("");
  const current = config.savedFilters.find((s) => s.name === selected) ?? null;
  const dirty = current !== null && !sameFilter(current.filter, filter);

  const persist = async (savedFilters: SavedFilter[]): Promise<void> => {
    const next = { ...config, savedFilters };
    await window.api.config.put(next);
    await refreshConfig();
  };

  const save = async (): Promise<void> => {
    const name = window.prompt("保存する名前")?.trim();
    if (!name) return;
    if (config.savedFilters.some((s) => s.name === name) && !window.confirm(M.confirmOverwrite(name))) return;
    await persist(upsertFilter(config.savedFilters, name, filter));
    setSelected(name);
  };

  const overwrite = async (): Promise<void> => {
    if (current === null) return;
    await persist(upsertFilter(config.savedFilters, current.name, filter));
  };

  const remove = async (): Promise<void> => {
    if (current === null) return;
    await persist(removeFilter(config.savedFilters, current.name));
    setSelected("");
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
      <button type="button" onClick={() => void save()}>
        保存
      </button>
      <button type="button" disabled={!dirty} onClick={() => void overwrite()}>
        上書き
      </button>
      <button type="button" disabled={current === null} onClick={() => void remove()}>
        削除
      </button>
    </div>
  );
}
