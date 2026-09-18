import { useEffect, useState } from "react";
import { STATUS_KINDS, type CategoryTemplate, type CustomField, type Label, type Project, type StatusDef, type StatusKind } from "../../shared/types";
import { TextField } from "../issues/FieldEditor";
import { KIND_LABEL } from "../issues/labels";
import { useSaveMessage } from "./Settings";
import { nextColor, PALETTE } from "./theme";
import { useNavigationGuard } from "./useHashRoute";
import { useSession } from "./UserContext";

/** Settings shared by the team through project.json and users/: the 種別 list with colours and templates, the 状態 stages, the ラベル list, the members, the 汎用列. */
export function ProjectSettings(): React.JSX.Element {
  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">プロジェクト設定</h1>
      </header>
      <div className="settings">
        <CategorySection />
        <StatusSection />
        <LabelSection />
        <MemberSection />
        <FieldSection />
      </div>
    </div>
  );
}

interface FieldRow { id: string; name: string; optionsText: string }

const fieldRowsOf = (p: Project): FieldRow[] => p.fields.map((f) => ({ id: f.id, name: f.name, optionsText: f.options.join("\n") }));

function FieldSection(): React.JSX.Element {
  const { project, refreshProject } = useSession();
  const [rows, setRows] = useState<FieldRow[]>(() => fieldRowsOf(project));
  const [dirty, setDirty] = useState(false);
  const [message, run] = useSaveMessage();
  useEffect(() => {
    if (!dirty) setRows(fieldRowsOf(project));
  }, [project, dirty]);
  useNavigationGuard(dirty);

  const update = (next: FieldRow[]): void => {
    setRows(next);
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1): void => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + d, 0, row);
    update(next);
  };
  const save = (): Promise<void> =>
    run(async () => {
      const fields: CustomField[] = rows.map((r) => ({ id: r.id, name: r.name, options: r.optionsText.split("\n") }));
      await window.api.project.putFields(fields);
      setDirty(false);
      await refreshProject();
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
              <input
                className="settings__name"
                aria-label="列名"
                value={r.name}
                onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <button type="button" aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label="下へ" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" onClick={() => update(rows.filter((_, j) => j !== i))}>
                削除
              </button>
              <div className="settings__template">
                <label className="issue-form__field">
                  選択肢
                  <textarea
                    className="issue-form__control"
                    rows={3}
                    value={r.optionsText}
                    onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, optionsText: e.target.value } : x)))}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
        {message && <p className="text--muted">{message}</p>}
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
  const act = (action: () => Promise<unknown>): Promise<void> =>
    run(async () => {
      try {
        await action();
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        throw new Error(m.includes("in-use") ? "担当者か登録者になっている課題があるため削除できません" : m);
      }
      await refreshUsers();
    });

  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">メンバー</h3>
      <ul className="settings__list">
        {members.map((u) => (
          <li key={u.username} className="settings__row">
            <TextField className="settings__name" value={u.displayName} required onSave={(v) => void act(() => window.api.users.rename(u.username, v))} />
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`${u.displayName} をメンバーから削除しますか`)) void act(() => window.api.users.remove(u.username));
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
          void act(async () => {
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
      {message && <p className="text--muted">{message}</p>}
    </section>
  );
}

interface CategoryRow { name: string; color: string | null; template: CategoryTemplate; open: boolean }

const EMPTY_TEMPLATE: CategoryTemplate = { summary: "", body: "" };

const rowsOf = (p: Project): CategoryRow[] =>
  p.categories.map((name) => ({ name, color: p.categoryColors[name] ?? null, template: p.categoryTemplates[name] ?? EMPTY_TEMPLATE, open: false }));

function CategorySection(): React.JSX.Element {
  const { project, refreshProject } = useSession();
  const [rows, setRows] = useState<CategoryRow[]>(() => rowsOf(project));
  const [dirty, setDirty] = useState(false);
  const [message, run] = useSaveMessage();
  // A list saved elsewhere replaces the rows only while nothing has been edited here.
  useEffect(() => {
    if (!dirty) setRows(rowsOf(project));
  }, [project, dirty]);
  useNavigationGuard(dirty);

  const update = (next: CategoryRow[]): void => {
    setRows(next);
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1): void => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + d, 0, row);
    update(next);
  };
  const save = (): Promise<void> =>
    run(async () => {
      const colors: Record<string, string> = {};
      const templates: Record<string, CategoryTemplate> = {};
      rows.forEach((r, i) => {
        const name = r.name.trim();
        if (name === "") return;
        colors[name] = r.color ?? PALETTE[i % PALETTE.length].hex; // the preset shown for the row is saved with it, so a later reorder keeps every 種別's colour
        templates[name] = r.template;
      });
      await window.api.project.put(
        rows.map((r) => r.name),
        colors,
        templates,
      );
      setDirty(false);
      await refreshProject();
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
              <ColorField
                value={r.color ?? PALETTE[i % PALETTE.length].hex}
                onChange={(color) => update(rows.map((x, j) => (j === i ? { ...x, color } : x)))}
              />
              <input
                className="settings__name"
                aria-label="種別名"
                value={r.name}
                onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <button type="button" aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label="下へ" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" aria-pressed={r.open} onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, open: !x.open } : x)))}>
                ひな形
              </button>
              <button type="button" onClick={() => update(rows.filter((_, j) => j !== i))}>
                削除
              </button>
              {r.open && (
                <div className="settings__template">
                  <label className="issue-form__field">
                    件名
                    <input
                      className="issue-form__control"
                      value={r.template.summary}
                      onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, template: { ...x.template, summary: e.target.value } } : x)))}
                    />
                  </label>
                  <label className="issue-form__field">
                    詳細
                    <textarea
                      className="issue-form__control"
                      rows={6}
                      value={r.template.body}
                      onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, template: { ...x.template, body: e.target.value } } : x)))}
                    />
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
        {message && <p className="text--muted">{message}</p>}
        <div className="form-actions">
          <button type="button" onClick={() => update([...rows, { name: "", color: null, template: EMPTY_TEMPLATE, open: false }])}>
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

function StatusSection(): React.JSX.Element {
  const { project, refreshProject } = useSession();
  const [rows, setRows] = useState<StatusDef[]>(() => project.statuses);
  const [dirty, setDirty] = useState(false);
  const [message, run] = useSaveMessage();
  useEffect(() => {
    if (!dirty) setRows(project.statuses);
  }, [project, dirty]);
  useNavigationGuard(dirty);

  const update = (next: StatusDef[]): void => {
    setRows(next);
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1): void => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + d, 0, row);
    update(next);
  };
  const save = (): Promise<void> =>
    run(async () => {
      await window.api.project.putStatuses(rows);
      setDirty(false);
      await refreshProject();
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
              <ColorField value={r.color} onChange={(color) => update(rows.map((x, j) => (j === i ? { ...x, color } : x)))} />
              <input
                className="settings__name"
                aria-label="状態名"
                value={r.name}
                onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <select aria-label="区分" value={r.kind} onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value as StatusKind } : x)))}>
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
              <button type="button" disabled={rows.length === 1} onClick={() => update(rows.filter((_, j) => j !== i))}>
                削除
              </button>
            </li>
          ))}
        </ul>
        {message && <p className="text--muted">{message}</p>}
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

interface LabelRow { name: string; color: string }

const labelRowsOf = (p: Project): LabelRow[] => p.labels.map((l) => ({ name: l.name, color: l.color }));

function LabelSection(): React.JSX.Element {
  const { project, refreshProject } = useSession();
  const [rows, setRows] = useState<LabelRow[]>(() => labelRowsOf(project));
  const [dirty, setDirty] = useState(false);
  const [message, run] = useSaveMessage();
  useEffect(() => {
    if (!dirty) setRows(labelRowsOf(project));
  }, [project, dirty]);
  useNavigationGuard(dirty);

  const update = (next: LabelRow[]): void => {
    setRows(next);
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1): void => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + d, 0, row);
    update(next);
  };
  const save = (): Promise<void> =>
    run(async () => {
      const labels: Label[] = rows.map((r) => ({ name: r.name, color: r.color }));
      await window.api.project.putLabels(labels);
      setDirty(false);
      await refreshProject();
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
              <ColorField value={r.color} onChange={(color) => update(rows.map((x, j) => (j === i ? { ...x, color } : x)))} />
              <input
                className="settings__name"
                aria-label="ラベル名"
                value={r.name}
                onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <button type="button" aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label="下へ" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" onClick={() => update(rows.filter((_, j) => j !== i))}>
                削除
              </button>
            </li>
          ))}
        </ul>
        {message && <p className="text--muted">{message}</p>}
        <div className="form-actions">
          <button type="button" onClick={() => update([...rows, { name: "", color: nextColor(rows.map((r) => r.color)) }])}>
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
