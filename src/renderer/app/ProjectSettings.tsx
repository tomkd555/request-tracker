import { useEffect, useState } from "react";
import { STATUS_KINDS, type CategoryTemplate, type CustomField, type Issue, type Label, type Milestone, type Project, type StatusDef, type StatusKind } from "../../shared/types";
import { TextField } from "../issues/FieldEditor";
import { KIND_LABEL } from "../issues/labels";
import { milestonesToIcs } from "./ics";
import { exportProjectSettings, parseProjectSettings } from "./projectSettingsFile";
import { renamedEntries, renamePlan, type Rename } from "./renameEntries";
import { nextColor, PALETTE } from "./theme";
import { useNavigationGuard } from "./useHashRoute";
import { FormMessageLine, useSaveMessage, type FormMessage } from "./useSaveMessage";
import { useSession } from "./SessionContext";
import { errorMessage, M } from "../messages";

const JSON_FILTER = { name: "JSON", extensions: ["json"] };
const ICS_FILTER = { name: "iCalendar", extensions: ["ics"] };

/**
 * Settings shared by the team through project.json and users/: the 種別 list with colours and templates, the 状態 stages,
 * the ラベル list, the マイルストーン list, the members, the 汎用列. The toolbar exports and imports them as one settings file.
 */
export function ProjectSettings(): React.JSX.Element {
  const { project, refreshProject } = useSession();
  const [message, setMessage] = useState<FormMessage | null>(null);
  // Bumped after an import so every section drops its draft and shows the imported lists.
  const [importCount, setImportCount] = useState(0);

  const exportSettings = async (): Promise<void> => {
    setMessage(null);
    try {
      const saved = await window.api.reports.save(exportProjectSettings(project), "project-settings.json", JSON_FILTER);
      setMessage(saved ? { text: M.settingsExported, isError: false } : null);
    } catch (e) {
      setMessage({ text: errorMessage(e), isError: true });
    }
  };
  const importSettings = async (): Promise<void> => {
    setMessage(null);
    try {
      const text = await window.api.files.openText(JSON_FILTER);
      if (text === null) return;
      const parsed = parseProjectSettings(text);
      if (!parsed.ok) {
        setMessage({ text: M.settingsFileInvalid(parsed.part), isError: true });
        return;
      }
      if (!window.confirm(M.confirmReplaceSettings)) return;
      const s = parsed.settings;
      let refreshError: string | null = null;
      try {
        await window.api.project.putStatuses(s.statuses);
        await window.api.project.put(s.categories, s.categoryColors, s.categoryTemplates);
        await window.api.project.putLabels(s.labels);
        await window.api.project.putFields(s.fields);
        await window.api.project.putMilestones(s.milestones);
      } finally {
        // A failed refresh must not replace the import's own error or skip the reset of the sections.
        try {
          await refreshProject();
        } catch (e) {
          refreshError = errorMessage(e);
        }
        setImportCount((n) => n + 1);
      }
      setMessage(refreshError === null ? { text: M.settingsImported, isError: false } : { text: refreshError, isError: true });
    } catch (e) {
      setMessage({ text: errorMessage(e), isError: true });
    }
  };

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">プロジェクト設定</h1>
        <div className="form-actions">
          <button type="button" onClick={() => void exportSettings()}>
            設定をエクスポート
          </button>
          <button type="button" onClick={() => void importSettings()}>
            設定をインポート
          </button>
        </div>
      </header>
      <FormMessageLine message={message} />
      <div className="settings" key={importCount}>
        <CategorySection />
        <StatusSection />
        <LabelSection />
        <MilestoneSection />
        <MemberSection />
        <FieldSection />
      </div>
    </div>
  );
}

interface DraftRows<T> {
  rows: T[];
  /** Replaces the rows without marking them edited, for state that is never saved (an open template panel). */
  setRows(rows: T[]): void;
  update(next: T[]): void;
  edit(i: number, patch: Partial<T>): void;
  move(i: number, step: -1 | 1): void;
  remove(i: number): void;
  /** Called once the save and the re-read are done, so the rows take the list just read. */
  markSaved(): void;
}

/**
 * The rows one section edits. A list saved elsewhere replaces them only while nothing has been edited here,
 * and leaving the screen with edits asks first. `rowsOf` is a module-level function, so the effect never re-runs for it.
 */
function useDraftRows<T>(rowsOf: (p: Project) => T[]): DraftRows<T> {
  const { project } = useSession();
  const [rows, setRows] = useState<T[]>(() => rowsOf(project));
  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => {
    if (!isDirty) setRows(rowsOf(project));
  }, [project, isDirty, rowsOf]);
  useNavigationGuard(isDirty);

  const update = (next: T[]): void => {
    setRows(next);
    setIsDirty(true);
  };
  const move = (i: number, step: -1 | 1): void => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + step, 0, row);
    update(next);
  };
  return {
    rows,
    setRows,
    update,
    edit: (i, patch) => update(rows.map((row, j) => (j === i ? { ...row, ...patch } : row))),
    move,
    remove: (i) => update(rows.filter((_, j) => j !== i)),
    markSaved: () => setIsDirty(false),
  };
}

const milestoneRowsOf = (p: Project): Milestone[] => (p.milestones ?? []).map((m) => ({ ...m }));

function MilestoneSection(): React.JSX.Element {
  const { project, refreshProject } = useSession();
  const { rows, update, edit, remove, markSaved } = useDraftRows(milestoneRowsOf);
  const [message, run] = useSaveMessage();
  const [icsMessage, setIcsMessage] = useState<FormMessage | null>(null);

  const save = (): Promise<void> =>
    run(async () => {
      if (rows.some((r) => r.startDate !== null && r.dueDate !== null && r.dueDate < r.startDate)) throw new Error(M.dueBeforeStart);
      await window.api.project.putMilestones(rows);
      await refreshProject();
      markSaved();
    });
  const exportIcs = async (): Promise<void> => {
    setIcsMessage(null);
    try {
      const listed = project.milestones ?? [];
      if (!listed.some((m) => m.dueDate !== null)) {
        setIcsMessage({ text: M.icsNoDueDate, isError: false });
        return;
      }
      const saved = await window.api.reports.save(milestonesToIcs(listed, new Date()), "milestones.ics", ICS_FILTER);
      setIcsMessage(saved ? { text: M.icsSaved, isError: false } : null);
    } catch (e) {
      setIcsMessage({ text: errorMessage(e), isError: true });
    }
  };

  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">マイルストーン</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ul className="settings__list">
          {rows.map((r, i) => (
            <li key={r.id} className="settings__row">
              <input className="settings__name" aria-label="名前" value={r.name} onChange={(e) => edit(i, { name: e.target.value })} />
              <label className="filter-bar__field">
                開始日
                <input type="date" value={r.startDate ?? ""} onChange={(e) => edit(i, { startDate: e.target.value || null })} />
              </label>
              <label className="filter-bar__field">
                期限日
                <input type="date" value={r.dueDate ?? ""} onChange={(e) => edit(i, { dueDate: e.target.value || null })} />
              </label>
              <label className="filter-bar__check">
                <input type="checkbox" checked={r.closed} onChange={(e) => edit(i, { closed: e.target.checked })} />
                完了
              </label>
              <button type="button" onClick={() => remove(i)}>
                削除
              </button>
            </li>
          ))}
        </ul>
        <FormMessageLine message={message} />
        <FormMessageLine message={icsMessage} />
        <div className="form-actions">
          <button type="button" onClick={() => update([...rows, { id: crypto.randomUUID(), name: "", startDate: null, dueDate: null, closed: false }])}>
            追加
          </button>
          <button type="submit">保存</button>
          <button type="button" onClick={() => void exportIcs()}>
            .icsに出力
          </button>
        </div>
      </form>
    </section>
  );
}

interface FieldRow { id: string; name: string; optionsText: string }

const fieldRowsOf = (p: Project): FieldRow[] => p.fields.map((f) => ({ id: f.id, name: f.name, optionsText: f.options.join("\n") }));

function FieldSection(): React.JSX.Element {
  const { refreshProject } = useSession();
  const { rows, update, edit, move, remove, markSaved } = useDraftRows(fieldRowsOf);
  const [message, run] = useSaveMessage();

  const save = (): Promise<void> =>
    run(async () => {
      const fields: CustomField[] = rows.map((r) => ({ id: r.id, name: r.name, options: r.optionsText.split("\n") }));
      await window.api.project.putFields(fields);
      await refreshProject();
      markSaved();
    });

  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">汎用列</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ul className="settings__list">
          {rows.map((r, i) => (
            <li key={r.id} className="settings__row">
              <input className="settings__name" aria-label="列名" value={r.name} onChange={(e) => edit(i, { name: e.target.value })} />
              <button type="button" aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label="下へ" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" onClick={() => remove(i)}>
                削除
              </button>
              <div className="settings__template">
                <label className="issue-form__field">
                  選択肢
                  <textarea className="issue-form__control" rows={3} value={r.optionsText} onChange={(e) => edit(i, { optionsText: e.target.value })} />
                </label>
              </div>
            </li>
          ))}
        </ul>
        <FormMessageLine message={message} />
        <div className="form-actions">
          <button type="button" onClick={() => update([...rows, { id: crypto.randomUUID(), name: "", optionsText: "" }])}>
            追加
          </button>
          <button type="submit">保存</button>
        </div>
      </form>
    </section>
  );
}

function MemberSection(): React.JSX.Element {
  const { users, refreshUsers } = useSession();
  const [name, setName] = useState("");
  const [message, run] = useSaveMessage();
  const members = [...users].sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));
  const runMemberAction = (action: () => Promise<unknown>): Promise<void> =>
    run(async () => {
      await action();
      await refreshUsers();
    });

  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">メンバー</h3>
      <ul className="settings__list">
        {members.map((u) => (
          <li key={u.username} className="settings__row">
            <TextField className="settings__name" ariaLabel="メンバーの名前" value={u.displayName} required onSave={(v) => void runMemberAction(() => window.api.users.rename(u.username, v))} />
            <button
              type="button"
              onClick={() => {
                if (window.confirm(M.confirmRemoveMember(u.displayName))) void runMemberAction(() => window.api.users.remove(u.username));
              }}
            >
              削除
            </button>
          </li>
        ))}
      </ul>
      <form
        className="settings__row"
        onSubmit={(e) => {
          e.preventDefault();
          void runMemberAction(async () => {
            await window.api.users.add(name);
            setName("");
          });
        }}
      >
        <input className="settings__name" aria-label="名前" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={name.trim() === ""}>
          追加
        </button>
      </form>
      <FormMessageLine message={message} />
    </section>
  );
}

/** `savedName` is the 種別 the row was loaded as, null for a row added here; a rename is judged against it. */
interface CategoryRow { savedName: string | null; name: string; color: string | null; template: CategoryTemplate; open: boolean }

const EMPTY_TEMPLATE: CategoryTemplate = { summary: "", body: "" };

// Own properties only: a 種別 named like an Object.prototype member (`__proto__`, `constructor`) must not read the inherited value as its colour or template.
const categoryRowsOf = (p: Project): CategoryRow[] =>
  p.categories.map((name) => ({
    savedName: name,
    name,
    color: Object.hasOwn(p.categoryColors, name) ? p.categoryColors[name] : null,
    template: Object.hasOwn(p.categoryTemplates, name) ? p.categoryTemplates[name] : EMPTY_TEMPLATE,
    open: false,
  }));

/** The colour a 種別 row shows: its own, or the preset at its position, as the issue screens show a 種別 with no saved colour. */
const rowColor = (row: CategoryRow, i: number): string => row.color ?? PALETTE[i % PALETTE.length].hex;

/** Asks whether to rename the old names on the issues that use them; the issues to save when the answer is yes, with the new names in place. */
async function askRenameOnIssues(renames: Rename[], field: "category" | "labels"): Promise<Issue[]> {
  if (renames.length === 0) return [];
  const plan = renamePlan(await window.api.issues.list(), renames, field);
  const used = plan.counts.filter((c) => c.count > 0);
  if (used.length === 0) return [];
  return window.confirm(M.confirmRenameOnIssues(used.map((c) => `「${c.rename.from}」→「${c.rename.to}」: ${c.count}件`))) ? plan.changed : [];
}

/** Saves the renamed issues, after the setting itself is saved. Every issue is tried, and the ones that failed are named so they can be renamed by hand. */
async function renameOnIssues(changed: Issue[], username: string): Promise<void> {
  const now = new Date().toISOString();
  const failed: string[] = [];
  for (const issue of changed) {
    try {
      await window.api.issues.put({ ...issue, updatedAt: now, updatedBy: username }, issue.updatedAt);
    } catch {
      failed.push(issue.key);
    }
  }
  if (failed.length > 0) throw new Error(M.renameOnIssuesFailed(failed));
}

function CategorySection(): React.JSX.Element {
  const { me, project, refreshProject } = useSession();
  const { rows, setRows, update, edit, move, remove, markSaved } = useDraftRows(categoryRowsOf);
  const [message, run] = useSaveMessage();

  const save = (): Promise<void> =>
    run(async () => {
      // The preset shown for a row is saved with it, so a later reorder keeps every 種別's colour.
      // Built from entries: an assignment to a 種別 named `__proto__` would set the prototype and store nothing.
      const named = rows.map((r, i) => ({ name: r.name.trim(), color: rowColor(r, i), template: r.template })).filter((r) => r.name !== "");
      const changed = await askRenameOnIssues(renamedEntries(project.categories, rows), "category");
      await window.api.project.put(
        rows.map((r) => r.name),
        Object.fromEntries(named.map((r) => [r.name, r.color])),
        Object.fromEntries(named.map((r) => [r.name, r.template])),
      );
      // The renames the user confirmed run even when the re-read fails.
      try {
        await renameOnIssues(changed, me.username);
      } finally {
        await refreshProject();
        markSaved();
      }
    });

  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">種別</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ul className="settings__list">
          {rows.map((r, i) => (
            <li key={i} className="settings__row">
              <ColorField value={rowColor(r, i)} onChange={(color) => edit(i, { color })} />
              <input className="settings__name" aria-label="種別名" value={r.name} onChange={(e) => edit(i, { name: e.target.value })} />
              <button type="button" aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label="下へ" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" aria-pressed={r.open} onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, open: !x.open } : x)))}>
                ひな形
              </button>
              <button type="button" onClick={() => remove(i)}>
                削除
              </button>
              {r.open && (
                <div className="settings__template">
                  <label className="issue-form__field">
                    件名
                    <input className="issue-form__control" value={r.template.summary} onChange={(e) => edit(i, { template: { ...r.template, summary: e.target.value } })} />
                  </label>
                  <label className="issue-form__field">
                    詳細
                    <textarea
                      className="issue-form__control"
                      rows={6}
                      value={r.template.body}
                      onChange={(e) => edit(i, { template: { ...r.template, body: e.target.value } })}
                    />
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
        <FormMessageLine message={message} />
        <div className="form-actions">
          <button type="button" onClick={() => update([...rows, { savedName: null, name: "", color: null, template: EMPTY_TEMPLATE, open: false }])}>
            追加
          </button>
          <button type="submit" disabled={rows.every((r) => r.name.trim() === "")}>
            保存
          </button>
        </div>
      </form>
    </section>
  );
}

/** The eight presets as swatches, then the native picker for any other colour. */
function ColorField({ value, onChange }: { value: string; onChange: (hex: string) => void }): React.JSX.Element {
  const current = value.toLowerCase();
  return (
    <span className="swatches" role="radiogroup" aria-label="色">
      {PALETTE.map((p) => (
        <button
          key={p.hex}
          type="button"
          role="radio"
          aria-checked={current === p.hex}
          aria-label={p.label}
          className={`swatches__item${current === p.hex ? " swatches__item--selected" : ""}`}
          style={{ background: p.hex }}
          onClick={() => onChange(p.hex)}
        />
      ))}
      <input type="color" aria-label="その他の色" value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

const statusRowsOf = (p: Project): StatusDef[] => p.statuses;

function StatusSection(): React.JSX.Element {
  const { refreshProject } = useSession();
  const { rows, update, edit, move, remove, markSaved } = useDraftRows(statusRowsOf);
  const [message, run] = useSaveMessage();

  const save = (): Promise<void> =>
    run(async () => {
      await window.api.project.putStatuses(rows);
      await refreshProject();
      markSaved();
    });

  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">状態</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ul className="settings__list">
          {rows.map((r, i) => (
            <li key={r.id} className="settings__row">
              <ColorField value={r.color} onChange={(color) => edit(i, { color })} />
              <input className="settings__name" aria-label="状態名" value={r.name} onChange={(e) => edit(i, { name: e.target.value })} />
              <select aria-label="区分" value={r.kind} onChange={(e) => edit(i, { kind: e.target.value as StatusKind })}>
                {STATUS_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <button type="button" aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label="下へ" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" disabled={rows.length === 1} onClick={() => remove(i)}>
                削除
              </button>
            </li>
          ))}
        </ul>
        <FormMessageLine message={message} />
        <div className="form-actions">
          <button type="button" onClick={() => update([...rows, { id: crypto.randomUUID(), name: "", color: nextColor(rows.map((r) => r.color)), kind: "active" }])}>
            追加
          </button>
          <button type="submit" disabled={rows.every((r) => r.name.trim() === "")}>
            保存
          </button>
        </div>
      </form>
    </section>
  );
}

/** `savedName` is the ラベル the row was loaded as, null for a row added here; a rename is judged against it. */
interface LabelRow extends Label { savedName: string | null }

const labelRowsOf = (p: Project): LabelRow[] => p.labels.map((label) => ({ ...label, savedName: label.name }));

function LabelSection(): React.JSX.Element {
  const { me, project, refreshProject } = useSession();
  const { rows, update, edit, move, remove, markSaved } = useDraftRows(labelRowsOf);
  const [message, run] = useSaveMessage();

  const save = (): Promise<void> =>
    run(async () => {
      const changed = await askRenameOnIssues(renamedEntries(project.labels.map((l) => l.name), rows), "labels");
      await window.api.project.putLabels(rows.map(({ name, color }) => ({ name, color })));
      // The renames the user confirmed run even when the re-read fails.
      try {
        await renameOnIssues(changed, me.username);
      } finally {
        await refreshProject();
        markSaved();
      }
    });

  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">ラベル</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ul className="settings__list">
          {rows.map((r, i) => (
            <li key={i} className="settings__row">
              <ColorField value={r.color} onChange={(color) => edit(i, { color })} />
              <input className="settings__name" aria-label="ラベル名" value={r.name} onChange={(e) => edit(i, { name: e.target.value })} />
              <button type="button" aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label="下へ" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" onClick={() => remove(i)}>
                削除
              </button>
            </li>
          ))}
        </ul>
        <FormMessageLine message={message} />
        <div className="form-actions">
          <button type="button" onClick={() => update([...rows, { savedName: null, name: "", color: nextColor(rows.map((r) => r.color)) }])}>
            追加
          </button>
          {/* An empty list is a valid save: it removes the last ラベル. */}
          <button type="submit" disabled={rows.length > 0 && rows.every((r) => r.name.trim() === "")}>
            保存
          </button>
        </div>
      </form>
    </section>
  );
}
