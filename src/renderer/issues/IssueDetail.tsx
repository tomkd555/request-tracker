import { useState } from "react";
import { ISSUE_PRIORITIES, ISSUE_STATUSES, type Issue } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { Attachments } from "./Attachments";
import { Comments } from "./Comments";
import { DateField, MarkdownField, SelectField, TextField } from "./FieldEditor";
import { HistoryList } from "./HistoryList";
import { formatDateTime, PRIORITY_LABEL, STATUS_LABEL } from "./labels";
import { useIssues } from "./useIssues";

export function IssueDetail({ issueKey }: { issueKey: string }): React.JSX.Element {
  const { me, users } = useSession();
  const { byKey, loaded, refreshOne } = useIssues();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const issue = byKey.get(issueKey);
  if (!loaded) return <div className="loading">読み込み中</div>;
  if (!issue) return <p>課題 {issueKey} は見つかりません。</p>;
  const parent = issue.parentKey ? byKey.get(issue.parentKey) : undefined;
  const children = [...byKey.values()].filter((i) => i.parentKey === issue.key).sort((a, b) => (a.key < b.key ? -1 : 1));

  // ponytail: last write wins, no stale-write check; history keeps the overwritten version
  const save = async (patch: Partial<Issue>): Promise<void> => {
    setError(null);
    try {
      await window.api.issues.put({ ...issue, ...patch, key: issue.key, updatedAt: new Date().toISOString(), updatedBy: me.username });
      await refreshOne(issue.key);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const userOptions = [{ value: "", label: "未設定" }, ...users.map((u) => ({ value: u.username, label: u.displayName }))];

  const remove = async (): Promise<void> => {
    if (children.length > 0) {
      setError("子課題があるため削除できません");
      return;
    }
    if (!window.confirm(`${issue.key} ${issue.summary} を削除しますか`)) return;
    try {
      await window.api.issues.remove(issue.key);
      await refreshOne(issue.key);
      navigate("/issues");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m.includes("has-children") ? "子課題があるため削除できません" : m);
    }
  };

  return (
    <div className="issue-detail">
      <div className="issue-head">
        <span className="issue-key">{issue.key}</span>
        <SelectField
          className={`pill status-${issue.status}`}
          value={issue.status}
          options={ISSUE_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          onSave={(status) => save({ status })}
        />
        <button type="button" className="head-action" onClick={() => void remove()}>
          削除
        </button>
      </div>
      <TextField className="summary-input" value={issue.summary} onSave={(summary) => save({ summary })} required />
      {error && <p className="error">{error}</p>}
      <dl className="fields">
        <dt>優先度</dt>
        <dd>
          <SelectField
            value={issue.priority}
            options={ISSUE_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
            onSave={(priority) => save({ priority })}
          />
        </dd>
        <dt>担当者</dt>
        <dd>
          <SelectField value={issue.assignee ?? ""} options={userOptions} onSave={(v) => save({ assignee: v || null })} />
        </dd>
        <dt>開始日</dt>
        <dd>
          <DateField value={issue.startDate} onSave={(startDate) => save({ startDate })} />
        </dd>
        <dt>期限日</dt>
        <dd>
          <DateField value={issue.dueDate} onSave={(dueDate) => save({ dueDate })} />
        </dd>
        <dt>登録者</dt>
        <dd>{displayNameOf(users, issue.reporter)}</dd>
        <dt>親課題</dt>
        <dd>{parent ? <a href={`#/issues/${parent.key}`}>{parent.key} {parent.summary}</a> : "なし"}</dd>
        <dt>登録日</dt>
        <dd>{formatDateTime(issue.createdAt)}</dd>
        <dt>更新日</dt>
        <dd>
          {formatDateTime(issue.updatedAt)} {displayNameOf(users, issue.updatedBy)}
        </dd>
      </dl>
      <section>
        <h2>詳細</h2>
        <MarkdownField value={issue.description} onSave={(description) => save({ description })} preview={(v) => <Markdown source={v} />} />
      </section>
      {issue.parentKey === null && (
        <section>
          <div className="section-head">
            <h2>子課題</h2>
            <a className="button" href={`#/issues/new?parent=${issue.key}`}>
              子課題を追加
            </a>
          </div>
          {children.length === 0 ? (
            <p className="muted">子課題はありません</p>
          ) : (
            <table className="issue-table">
              <thead>
                <tr>
                  <th>キー</th>
                  <th>件名</th>
                  <th>状態</th>
                  <th>担当者</th>
                </tr>
              </thead>
              <tbody>
                {children.map((c) => (
                  <tr key={c.key} onClick={() => (window.location.hash = `/issues/${c.key}`)}>
                    <td className="col-key">{c.key}</td>
                    <td>{c.summary}</td>
                    <td>
                      <span className={`pill status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                    </td>
                    <td>{displayNameOf(users, c.assignee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      <Attachments issueKey={issue.key} />
      <Comments issueKey={issue.key} />
      <section>
        <h2>履歴</h2>
        <HistoryList
          issueKey={issue.key}
          version={version}
          onRestore={(old) => save({ summary: old.summary, description: old.description, status: old.status, priority: old.priority, assignee: old.assignee, startDate: old.startDate, dueDate: old.dueDate })}
        />
      </section>
    </div>
  );
}
