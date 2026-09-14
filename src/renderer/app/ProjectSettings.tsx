import { useEffect, useState } from "react";
import type { CategoryTemplate, Project } from "../../shared/types";
import { useSaveMessage } from "./Settings";
import { TYPE_PILL_DEFAULT } from "./theme";
import { useSession } from "./UserContext";

/** Settings shared by the team through project.json and users/: the 種別 list with colours and templates. */
export function ProjectSettings(): React.JSX.Element {
  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">プロジェクト設定</h1>
      </header>
      <div className="settings">
        <CategorySection />
      </div>
    </div>
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
      for (const r of rows) {
        const name = r.name.trim();
        if (name === "") continue;
        if (r.color !== null) colors[name] = r.color;
        templates[name] = r.template;
      }
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
              <input
                type="color"
                aria-label="色"
                value={r.color ?? TYPE_PILL_DEFAULT}
                onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}
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
