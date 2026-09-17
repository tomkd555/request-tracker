import { useState } from "react";
import { THEME_NAMES, type LocalSettings, type ThemeName } from "../../shared/types";
import { accentOf, applyAppearance, THEMES } from "./theme";
import { useNavigationGuard } from "./useHashRoute";
import { useSession } from "./UserContext";

/** Result line under a form: the saved message, or the store's error. Shared with the project settings screen. */
export function useSaveMessage(): [string | null, (action: () => Promise<void>) => Promise<void>] {
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

/** Per-machine settings: name, appearance and timing, the shared folder. Team settings live on ProjectSettings. */
export function Settings(): React.JSX.Element {
  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">設定</h1>
      </header>
      <div className="settings">
        <DisplayNameSection />
        <AppearanceSection />
        <FolderSection />
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
      // The payload starts from the live session config, not the draft snapshot taken at mount, so a view saved
      // elsewhere in the meantime (savedFilters) is not reverted; only the four fields this form edits come from draft.
      const next = { ...config, theme: draft.theme, accent: draft.accent, dueSoonDays: draft.dueSoonDays };
      const saved = await window.api.config.put(next);
      applyAppearance(saved);
      await refreshConfig();
    });
  const patch = (p: Partial<LocalSettings>): void => setDraft((d) => ({ ...d, ...p }));
  useNavigationGuard(
    draft.theme !== config.theme || draft.accent !== config.accent || draft.dueSoonDays !== config.dueSoonDays,
  );

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
  useNavigationGuard(name !== me.displayName);
  return (
    <section className="issue-form settings__section">
      <h3 className="settings__heading">名前</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await window.api.users.rename(me.username, name);
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
              // The boot sequence runs again against the new folder.
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
