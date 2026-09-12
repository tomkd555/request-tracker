import { useEffect, useState } from "react";
import { useSession } from "./UserContext";

/** Project settings: the 種別 list, one per line. Saved through project.put; every client picks the change up from the poller. */
export function Settings(): React.JSX.Element {
  const { project, refreshProject } = useSession();
  const [text, setText] = useState(project.categories.join("\n"));
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setText(project.categories.join("\n")), [project.categories]);

  const save = async (): Promise<void> => {
    setMessage(null);
    try {
      await window.api.project.put(text.split(/\r?\n/));
      await refreshProject();
      setMessage("保存しました");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">設定</h1>
      </header>
      <form
        className="issue-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="issue-form__field">
          種別
          <textarea className="issue-form__control" value={text} onChange={(e) => setText(e.target.value)} rows={8} />
        </label>
        {message && <p className="text--muted">{message}</p>}
        <div className="form-actions">
          <button type="submit" disabled={text.trim() === ""}>
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
