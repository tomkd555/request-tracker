import { displayNameOf, useSession } from "../app/UserContext";
import { formatDate, formatDateTime, PRIORITY_LABEL, STATUS_LABEL } from "./labels";
import { useIssues } from "./useIssues";

export function IssueDetail({ issueKey }: { issueKey: string }): React.JSX.Element {
  const { users } = useSession();
  const { byKey, loaded } = useIssues();
  const issue = byKey.get(issueKey);
  if (!loaded) return <div className="loading">読み込み中</div>;
  if (!issue) return <p>課題 {issueKey} は見つかりません。</p>;
  const parent = issue.parentKey ? byKey.get(issue.parentKey) : undefined;

  return (
    <div className="issue-detail">
      <div className="issue-head">
        <span className="issue-key">{issue.key}</span>
        <span className={`pill status-${issue.status}`}>{STATUS_LABEL[issue.status]}</span>
      </div>
      <h1>{issue.summary}</h1>
      <dl className="fields">
        <dt>状態</dt>
        <dd>{STATUS_LABEL[issue.status]}</dd>
        <dt>優先度</dt>
        <dd>{PRIORITY_LABEL[issue.priority]}</dd>
        <dt>担当者</dt>
        <dd>{displayNameOf(users, issue.assignee) || "未設定"}</dd>
        <dt>登録者</dt>
        <dd>{displayNameOf(users, issue.reporter)}</dd>
        <dt>開始日</dt>
        <dd>{formatDate(issue.startDate)}</dd>
        <dt>期限日</dt>
        <dd>{formatDate(issue.dueDate)}</dd>
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
        <pre className="description">{issue.description}</pre>
      </section>
    </div>
  );
}
