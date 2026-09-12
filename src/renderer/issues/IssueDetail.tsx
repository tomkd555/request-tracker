import { useEffect, useRef, useState } from "react";
import { ISSUE_PRIORITIES, ISSUE_STATUSES, type Issue } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { categoryOptions, displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { Attachments } from "./Attachments";
import { Comments } from "./Comments";
import { DateField, MarkdownField, SelectField, TextField } from "./FieldEditor";
import { HistoryList } from "./HistoryList";
import { formatDateTime, PRIORITY_LABEL, STATUS_LABEL, statusClass } from "./labels";
import { relatedIssues } from "./relatedIssues";
import { markSeen } from "./seen";
import { useIssues } from "./useIssues";

export function IssueDetail({ issueKey }: { issueKey: string }): React.JSX.Element {
  const { me, users, project } = useSession();
  const { byKey, loaded, refreshOne } = useIssues();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const issue = byKey.get(issueKey);
  // The record the next save builds on: the last one written here, until the store hands back a newer one.
  const latest = useRef<Issue | undefined>(issue);
  useEffect(() => {
    latest.current = issue;
    if (issue) markSeen(issue);
  }, [issue]);
  if (!loaded) return <div className="text--loading">読み込み中</div>;
  if (!issue) return <p>課題 {issueKey} は見つかりません。</p>;
  const parent = issue.parentKey ? byKey.get(issue.parentKey) : undefined;
  const children = [...byKey.values()].filter((i) => i.parentKey === issue.key).sort((a, b) => (a.key < b.key ? -1 : 1));
  const related = relatedIssues(issue, byKey);

  // ponytail: last write wins, no stale-write check; history keeps the overwritten version
  const put = async (patch: Partial<Issue>): Promise<void> => {
    const next: Issue = { ...(latest.current ?? issue), ...patch, key: issue.key, updatedAt: new Date().toISOString(), updatedBy: me.username };
    latest.current = next; // a second edit before refreshOne resolves builds on this one
    await window.api.issues.put(next);
    await refreshOne(issue.key);
    setVersion((v) => v + 1);
  };
  const save = async (patch: Partial<Issue>): Promise<void> => {
    setError(null);
    try {
      await put(patch);
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
      <div className="issue-detail__head">
        <span className="issue-detail__key">{issue.key}</span>
        <SelectField
          className={`${statusClass(issue.status)} pill--select`}
          ariaLabel="状態"
          value={issue.status}
          options={ISSUE_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          onSave={(status) => save({ status })}
        />
        <div className="issue-detail__actions">
          {issue.status === "resolved" && issue.reporter === me.username && (
            <button type="button" className="link-button" onClick={() => void save({ status: "closed" })}>
              確認して完了にする
            </button>
          )}
          <a className="link-button" href={`#/issues/new?copy=${issue.key}`}>
            複製
          </a>
          <button type="button" onClick={() => void remove()}>
            削除
          </button>
        </div>
      </div>
      <TextField className="issue-detail__summary-input" value={issue.summary} onSave={(summary) => save({ summary })} required />
      {error && <p className="text--error">{error}</p>}
      <dl className="issue-detail__fields">
        <dt className="issue-detail__term">種別</dt>
        <dd className="issue-detail__desc">
          <SelectField
            className="issue-detail__control"
            ariaLabel="種別"
            value={issue.category}
            options={[...(issue.category === "" ? [{ value: "", label: "未設定" }] : []), ...categoryOptions(project, issue.category).map((c) => ({ value: c, label: c }))]}
            onSave={(category) => save({ category })}
          />
        </dd>
        <dt className="issue-detail__term">優先度</dt>
        <dd className="issue-detail__desc">
          <SelectField
            className="issue-detail__control"
            ariaLabel="優先度"
            value={issue.priority}
            options={ISSUE_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
            onSave={(priority) => save({ priority })}
          />
        </dd>
        <dt className="issue-detail__term">担当者</dt>
        <dd className="issue-detail__desc">
          <SelectField
            className="issue-detail__control"
            ariaLabel="担当者"
            value={issue.assignee ?? ""}
            options={userOptions}
            onSave={(v) => save({ assignee: v || null })}
          />
        </dd>
        <dt className="issue-detail__term">開始日</dt>
        <dd className="issue-detail__desc">
          <DateField className="issue-detail__control" ariaLabel="開始日" value={issue.startDate} onSave={(startDate) => save({ startDate })} />
        </dd>
        <dt className="issue-detail__term">期限日</dt>
        <dd className="issue-detail__desc">
          <DateField className="issue-detail__control" ariaLabel="期限日" value={issue.dueDate} onSave={(dueDate) => save({ dueDate })} />
        </dd>
        <dt className="issue-detail__term">登録者</dt>
        <dd className="issue-detail__desc">{displayNameOf(users, issue.reporter)}</dd>
        <dt className="issue-detail__term">親課題</dt>
        <dd className="issue-detail__desc">{parent ? <a href={`#/issues/${parent.key}`}>{parent.key} {parent.summary}</a> : "なし"}</dd>
        <dt className="issue-detail__term">登録日</dt>
        <dd className="issue-detail__desc">{formatDateTime(issue.createdAt)}</dd>
        <dt className="issue-detail__term">更新日</dt>
        <dd className="issue-detail__desc">
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
            <a className="link-button" href={`#/issues/new?parent=${issue.key}`}>
              子課題を追加
            </a>
          </div>
          {children.length === 0 ? (
            <p className="text--muted">子課題はありません</p>
          ) : (
            <table className="issue-table">
              <thead>
                <tr>
                  <th className="issue-table__header">キー</th>
                  <th className="issue-table__header">件名</th>
                  <th className="issue-table__header">状態</th>
                  <th className="issue-table__header">担当者</th>
                </tr>
              </thead>
              <tbody>
                {children.map((c) => (
                  <tr key={c.key} className="issue-table__row" onClick={() => (window.location.hash = `/issues/${c.key}`)}>
                    <td className="issue-table__cell issue-table__cell--key">{c.key}</td>
                    <td className="issue-table__cell">{c.summary}</td>
                    <td className="issue-table__cell">
                      <span className={statusClass(c.status)}>{STATUS_LABEL[c.status]}</span>
                    </td>
                    <td className="issue-table__cell">{displayNameOf(users, c.assignee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {related.length > 0 && (
        <section>
          <h2>関連課題</h2>
          <ul className="related">
            {related.map((r) => (
              <li key={r.key} className="related__item">
                <a href={`#/issues/${r.key}`}>{r.key}</a> {r.summary}{" "}
                <span className={statusClass(r.status)}>{STATUS_LABEL[r.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Attachments issueKey={issue.key} />
      <Comments issue={issue} version={version} onStatus={(status) => put({ status })} />
      <section>
        <h2>履歴</h2>
        <HistoryList
          issueKey={issue.key}
          version={version}
          onRestore={(old) =>
            save({ summary: old.summary, description: old.description, category: old.category, status: old.status, priority: old.priority, assignee: old.assignee, startDate: old.startDate, dueDate: old.dueDate })
          }
        />
      </section>
    </div>
  );
}
