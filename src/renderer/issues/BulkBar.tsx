import { useState } from "react";
import type { Project } from "../../shared/types";
import { AssigneeSelect } from "./AssigneeSelect";
import { MAX_BULK_ROWS, type BulkPatch, type BulkResult } from "./bulkEdit";
import { selectableMilestones } from "./milestones";
import { errorMessage, M } from "../messages";

const KEEP = "__keep__";
type DueMode = "keep" | "set" | "clear";

type Props = {
  count: number;
  project: Project;
  onExecute(patch: BulkPatch): Promise<BulkResult[]>;
  onClear(): void;
};

/** Bar shown above the 課題 table while one or more rows are checked; builds one BulkPatch and runs it. */
export function BulkBar({ count, project, onExecute, onClear }: Props): React.JSX.Element {
  const [status, setStatus] = useState<string>(KEEP);
  const [assignee, setAssignee] = useState<string>(KEEP);
  const [dueMode, setDueMode] = useState<DueMode>("keep");
  const [dueDate, setDueDate] = useState("");
  const [milestone, setMilestone] = useState<string>(KEEP);
  const [labelToAdd, setLabelToAdd] = useState("");
  const [labelToRemove, setLabelToRemove] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BulkResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOverCap = count > MAX_BULK_ROWS;

  const runBulkEdit = async (): Promise<void> => {
    const patch: BulkPatch = {};
    if (status !== KEEP) patch.status = status;
    if (assignee !== KEEP) patch.assignee = assignee || null;
    if (dueMode === "set") patch.dueDate = dueDate;
    if (dueMode === "clear") patch.dueDate = null;
    if (milestone !== KEEP) patch.milestone = milestone || null;
    if (labelToAdd !== "") patch.labelToAdd = labelToAdd;
    if (labelToRemove !== "") patch.labelToRemove = labelToRemove;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      setResult(await onExecute(patch));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  const successCount = result?.filter((r) => r.ok).length ?? 0;
  const failures = result?.filter((r) => !r.ok) ?? [];

  return (
    <div className="bulk-bar">
      <span className="bulk-bar__count">{count}件を選択中</span>
      <label className="bulk-bar__field">
        状態
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value={KEEP}>変更しない</option>
          {project.statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="bulk-bar__field">
        担当者
        <AssigneeSelect
          value={assignee}
          leading={[
            { value: KEEP, label: "変更しない" },
            { value: "", label: "未設定" },
          ]}
          onChange={setAssignee}
        />
      </label>
      <label className="bulk-bar__field">
        期限日
        <select value={dueMode} onChange={(e) => setDueMode(e.target.value as DueMode)}>
          <option value="keep">変更しない</option>
          <option value="set">日付を設定</option>
          <option value="clear">クリア</option>
        </select>
        {dueMode === "set" && <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
      </label>
      {(project.milestones ?? []).length > 0 && (
        <label className="bulk-bar__field">
          マイルストーン
          <select value={milestone} onChange={(e) => setMilestone(e.target.value)}>
            <option value={KEEP}>変更しない</option>
            <option value="">未設定</option>
            {selectableMilestones(project.milestones ?? [], null).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="bulk-bar__field">
        ラベル追加
        <select value={labelToAdd} onChange={(e) => setLabelToAdd(e.target.value)}>
          <option value="">変更しない</option>
          {project.labels.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="bulk-bar__field">
        ラベル削除
        <select value={labelToRemove} onChange={(e) => setLabelToRemove(e.target.value)}>
          <option value="">変更しない</option>
          {project.labels.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="button--primary" disabled={isOverCap || running || (dueMode === "set" && dueDate === "")} onClick={() => void runBulkEdit()}>
        実行
      </button>
      <button type="button" onClick={onClear}>
        選択解除
      </button>
      {isOverCap && <p className="text--error">{M.bulkOverCap(MAX_BULK_ROWS)}</p>}
      {error && <p className="text--error">{error}</p>}
      {result && (
        <div className="bulk-bar__result">
          <p>{M.bulkUpdated(successCount)}</p>
          {failures.length > 0 && (
            <ul className="bulk-bar__failures">
              {failures.map((f) => (
                <li key={f.key} className="text--error">
                  {f.key}: {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
