import { useState } from "react";
import type { IssueDraft } from "../../shared/api";
import { ISSUE_PRIORITIES, type IssuePriority } from "../../shared/types";
import { useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { PRIORITY_LABEL } from "./labels";
import { useIssues } from "./useIssues";

export function IssueCreate({ parentKey }: { parentKey: string | null }): React.JSX.Element {
  const { me, users } = useSession();
  const { byKey, issues, refreshOne } = useIssues();
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("normal");
  const [assignee, setAssignee] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [parent, setParent] = useState<string>(parentKey ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parents = issues.filter((i) => i.parentKey === null).sort((a, b) => (a.key < b.key ? 1 : -1));
  const presetParent = parentKey !== null ? byKey.get(parentKey) : undefined;

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (summary.trim() === "") return;
    setBusy(true);
    setError(null);
    const now = new Date().toISOString();
    const draft: IssueDraft = {
      summary: summary.trim(),
      description,
      status: "open",
      priority,
      assignee: assignee || null,
      reporter: me.username,
      parentKey: parent || null,
      startDate: startDate || null,
      dueDate: dueDate || null,
      createdAt: now,
      updatedAt: now,
      updatedBy: me.username,
    };
    try {
      const created = await window.api.issues.create(draft);
      await refreshOne(created.key);
      navigate(`/issues/${created.key}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form className="issue-form" onSubmit={submit}>
      <h1>{parentKey ? "子課題の追加" : "課題の追加"}</h1>
      <label className="issue-form__field">
        件名
        <input className="issue-form__control" value={summary} onChange={(e) => setSummary(e.target.value)} required autoFocus />
      </label>
      <label className="issue-form__field">
        詳細
        <textarea className="issue-form__control" value={description} onChange={(e) => setDescription(e.target.value)} rows={8} />
      </label>
      <div className="form-row">
        <label className="issue-form__field">
          優先度
          <select className="issue-form__control" value={priority} onChange={(e) => setPriority(e.target.value as IssuePriority)}>
            {ISSUE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="issue-form__field">
          担当者
          <select className="issue-form__control" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">未設定</option>
            {users.map((u) => (
              <option key={u.username} value={u.username}>
                {u.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="issue-form__field">
          開始日
          <input className="issue-form__control" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="issue-form__field">
          期限日
          <input className="issue-form__control" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      <label className="issue-form__field">
        親課題
        {presetParent ? (
          <input className="issue-form__control" value={`${presetParent.key} ${presetParent.summary}`} readOnly />
        ) : (
          <select className="issue-form__control" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">なし</option>
            {parents.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key} {p.summary}
              </option>
            ))}
          </select>
        )}
      </label>
      {error && <p className="text--error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy || summary.trim() === ""}>
          追加
        </button>
        <button type="button" onClick={() => navigate(parentKey ? `/issues/${parentKey}` : "/issues")}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
