import { useEffect, useRef, useState } from "react";
import type { IssueFilter, SavedFilter } from "../../shared/types";
import { useSession } from "../app/SessionContext";
import { removeFilter, restoreFilter, sameFilter, upsertFilter } from "./savedFilter";
import { errorMessage, M } from "../messages";

type Props = { filter: IssueFilter; onChange(f: IssueFilter): void };

/** Bookmarks a filter per machine, in config.json. Shown beside FilterBar on the list, kanban and gantt screens. */
export function SavedFilters({ filter, onChange }: Props): React.JSX.Element {
  const { config, project, refreshConfig } = useSession();
  const [selectedName, setSelectedName] = useState("");
  const [draftName, setDraftName] = useState<string | null>(null); // the name typed after 保存; null while the field is closed
  const [error, setError] = useState<string | null>(null);
  const isNaming = draftName !== null;
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const wasNaming = useRef(false);
  // The field unmounts with the focus inside it; the button that opened it takes the focus back.
  useEffect(() => {
    if (wasNaming.current && !isNaming) saveButtonRef.current?.focus();
    wasNaming.current = isNaming;
  }, [isNaming]);
  const selectedSaved = config.savedFilters.find((s) => s.name === selectedName) ?? null;
  // Compared as the bar restored it, so a stage, column or milestone removed since the save counts as no change.
  const isModified = selectedSaved !== null && !sameFilter(restoreFilter(selectedSaved.filter, project), filter);

  /** False when config.json could not be written; the reason shows beside the buttons. */
  const writeSavedFilters = async (savedFilters: SavedFilter[]): Promise<boolean> => {
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
    const n = draftName?.trim();
    if (!n) return;
    if (config.savedFilters.some((s) => s.name === n) && !window.confirm(M.confirmOverwrite(n))) return;
    if (!(await writeSavedFilters(upsertFilter(config.savedFilters, n, filter)))) return;
    setSelectedName(n);
    setDraftName(null);
  };

  const overwrite = async (): Promise<void> => {
    if (selectedSaved === null) return;
    await writeSavedFilters(upsertFilter(config.savedFilters, selectedSaved.name, filter));
  };

  const remove = async (): Promise<void> => {
    if (selectedSaved === null) return;
    if (await writeSavedFilters(removeFilter(config.savedFilters, selectedSaved.name))) setSelectedName("");
  };

  return (
    <div className="filter-bar saved-filters">
      <label className="filter-bar__field">
        検索条件
        <select
          value={selectedName}
          onChange={(e) => {
            setSelectedName(e.target.value);
            const s = config.savedFilters.find((f) => f.name === e.target.value);
            if (s) onChange(restoreFilter(s.filter, project));
          }}
        >
          <option value="">{M.selectPrompt}</option>
          {config.savedFilters.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name === selectedName && isModified ? `${s.name}（未保存）` : s.name}
            </option>
          ))}
        </select>
      </label>
      {draftName === null ? (
        <button type="button" ref={saveButtonRef} onClick={() => setDraftName("")}>
          保存
        </button>
      ) : (
        <>
          <input
            className="filter-bar__search"
            aria-label="保存する名前"
            placeholder="保存する名前"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setDraftName(null);
            }}
          />
          <button type="button" disabled={draftName.trim() === ""} onClick={() => void save()}>
            保存
          </button>
          <button type="button" onClick={() => setDraftName(null)}>
            キャンセル
          </button>
        </>
      )}
      <button type="button" disabled={!isModified} onClick={() => void overwrite()}>
        上書き
      </button>
      <button type="button" disabled={selectedSaved === null} onClick={() => void remove()}>
        削除
      </button>
      {error && <span className="text--error">{error}</span>}
    </div>
  );
}
