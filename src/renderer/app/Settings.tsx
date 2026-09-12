import { useEffect, useState } from "react";
import { THEME_NAMES, type CategoryTemplate, type LocalSettings, type Project, type ThemeName } from "../../shared/types";
import { accentOf, applyAppearance, THEMES, TYPE_PILL_DEFAULT } from "./theme";
import { useSession } from "./UserContext";

/** Result line under a form: the saved message, or the store's error. */
function useSaveMessage(): [string | null, (action: () => Promise<void>) => Promise<void>] {
  const [message, setMessage] = useState<string | null>(null);
  const run = async (action: () => Promise<void>): Promise<void> => {
    setMessage(null);
    try {
      await action();
      setMessage("保存しました");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  return [message, run];
}

/** Settings in two groups: 個人設定 (name, appearance and timing, the shared folder; all per machine) and プロジェクト設定 (the team's 種別 list with colours). */
export function Settings(): React.JSX.Element {
  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">設定</h1>
      </header>
      <div className="settings">
        <h2 className="settings__group">個人設定</h2>
        <DisplayNameSection />
        <AppearanceSection />
        <FolderSection />
        <h2 className="settings__group">プロジェクト設定</h2>
        <CategorySection />
      </div>
    </div>
  );
}

function AppearanceSection(): React.JSX.Element {
  const { config, refreshConfig } = useSession();
  const [draft, setDraft] = useState<LocalSettings>(config);
  const [message, run] = useSaveMessage();
  const save = (): Promise<void> =>
    run(async () => {
      const saved = await window.api.config.put(draft);
      applyAppearance(saved);
      await refreshConfig();
    });
  const patch = (p: Partial<LocalSettings>): void => setDraft((d) => ({ ...d, ...p }));

  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">表示</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className="settings__fieldset">
          <legend>配色</legend>
          {THEME_NAMES.map((name: ThemeName) => (
            <label key={name} className="settings__radio">
              <input type="radio" name="theme" value={name} checked={draft.theme === name} onChange={() => patch({ theme: name })} />
              {THEMES[name].label}
            </label>
          ))}
        </fieldset>
        <div className="settings__row">
          <label className="settings__inline">
            アクセント色
            <input type="color" value={accentOf(draft)} onChange={(e) => patch({ accent: e.target.value })} />
          </label>
          <button type="button" disabled={draft.accent === null} onClick={() => patch({ accent: null })}>
            プリセットの色に戻す
          </button>
        </div>
        <div className="settings__row">
          <label className="settings__inline">
            期限間近（日）
            <input
              type="number"
              className="settings__number"
              required
              min={0}
              max={30}
              step={1}
              value={draft.dueSoonDays}
              onChange={(e) => patch({ dueSoonDays: Number(e.target.value) })}
            />
          </label>
          <label className="settings__inline">
            更新間隔（秒）
            <input
              type="number"
              className="settings__number"
              required
              min={2}
              max={60}
              step={1}
              value={draft.pollIntervalMs / 1000}
              onChange={(e) => patch({ pollIntervalMs: Number(e.target.value) * 1000 })}
            />
          </label>
        </div>
        {message && <p className="text--muted">{message}</p>}
        <div className="form-actions">
          <button type="submit">保存</button>
        </div>
      </form>
    </section>
  );
}

function DisplayNameSection(): React.JSX.Element {
  const { me, refreshUsers } = useSession();
  const [name, setName] = useState(me.displayName);
  const [message, run] = useSaveMessage();
  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">名前</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await window.api.users.register(name);
            await refreshUsers();
          });
        }}
      >
        <label className="issue-form__field">
          名前
          <input className="issue-form__control" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {message && <p className="text--muted">{message}</p>}
        <div className="form-actions">
          <button type="submit" disabled={name.trim() === ""}>
            保存
          </button>
        </div>
      </form>
    </section>
  );
}

function FolderSection(): React.JSX.Element {
  const { config } = useSession();
  const [message, run] = useSaveMessage();
  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">共有フォルダ</h3>
      <p className="settings__path">{config.rootDir}</p>
      {message && <p className="text--muted">{message}</p>}
      <div className="form-actions">
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              // The boot sequence runs again against the new folder; the poller resets on the root change.
              if ((await window.api.config.chooseRoot()) !== null) window.location.reload();
            })
          }
        >
          変更
        </button>
      </div>
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
