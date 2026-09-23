import { useEffect, useRef, useState } from "react";
import { ancestorsOf, depthOf, descendantKeysOf, heightOf, MAX_DEPTH } from "../../shared/issueTree";
import { ISSUE_PRIORITIES, RELATION_TYPES, type Issue, type RelationType } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { categoryOptions, displayNameOf, useSession, withCurrent } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { AssigneeSelect } from "./AssigneeSelect";
import { Attachments } from "./Attachments";
import { Comments } from "./Comments";
import { today } from "./dates";
import { dueTone } from "./dueTone";
import { DateField, MarkdownField, SelectField, TextField } from "./FieldEditor";
import { HistoryList } from "./HistoryList";
import { firstOfKind, formatDateTime, INVERSE_LABEL, PRIORITY_LABEL, RELATION_LABEL, statusKind, statusName, statusStyle } from "./labels";
import { LabelPicker } from "./LabelPicker";
import { ParentField } from "./ParentField";
import { addRelation, relatedIssues, relationRows } from "./relatedIssues";
import { markSeen } from "./seen";
import { useIssues } from "./useIssues";
import { errorMessage, M } from "../messages";

export function IssueDetail({ issueKey }: { issueKey: string }): React.JSX.Element {
  const { me, users, project, config } = useSession();
  const { byKey, loaded, refreshOne } = useIssues();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [newRelationType, setNewRelationType] = useState<RelationType>("relates");
  const [newRelationKey, setNewRelationKey] = useState<string | null>(null);
  const [newRelationInvalid, setNewRelationInvalid] = useState(false);
  const issue = byKey.get(issueKey);
  // The record the next save builds on: the last one written here, until the store hands back a newer one.
  const latest = useRef<Issue | undefined>(issue);
  useEffect(() => {
    latest.current = issue;
    if (issue) markSeen(issue);
  }, [issue]);
  if (!loaded) return <div className="text--loading">読み込み中</div>;
  if (!issue) return <p>課題 {issueKey} が見つかりません。</p>;
  const all = [...byKey.values()];
  const ancestors = ancestorsOf(byKey, issue.key);
  const depth = ancestors.length + 1;
  const children = all.filter((i) => i.parentKey === issue.key).sort((a, b) => (a.key < b.key ? -1 : 1));
  const related = relatedIssues(issue, byKey);
  const underThis = descendantKeysOf(all, issue.key);
  const height = heightOf(all, issue.key);
  const parentCandidates = all.filter((i) => !underThis.has(i.key) && depthOf(byKey, i.key) + height <= MAX_DEPTH).sort((a, b) => (a.key < b.key ? 1 : -1));
  const rows = relationRows(issue, byKey);
  const shownKeys = new Set(rows.map((r) => r.key));
  const mentionRows = related.filter((r) => !shownKeys.has(r.key));
  const relationCandidates = [...byKey.values()].filter((i) => i.key !== issue.key).sort((a, b) => (a.key < b.key ? 1 : -1));
  const relationBlocked = newRelationKey === null || newRelationInvalid;

  const put = async (patch: Partial<Issue>): Promise<void> => {
    const base = latest.current ?? issue;
    const next: Issue = { ...base, ...patch, key: issue.key, updatedAt: new Date().toISOString(), updatedBy: me.username };
    await window.api.issues.put(next, base.updatedAt);
    latest.current = next; // only once the write lands, so a rejected save never becomes the base for the next one
    await refreshOne(issue.key);
    setVersion((v) => v + 1);
  };
  const save = async (patch: Partial<Issue>): Promise<void> => {
    setError(null);
    try {
      await put(patch);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const reload = (): void => {
    setError(null);
    void refreshOne(issue.key);
  };
  const addNewRelation = (): void => {
    if (relationBlocked || newRelationKey === null) return;
    void save({ relations: addRelation(issue.relations, { type: newRelationType, key: newRelationKey }) });
    setNewRelationKey(null);
  };
  const removeRelation = (row: { type: RelationType; key: string }): void => {
    void save({ relations: issue.relations.filter((r) => !(r.type === row.type && r.key === row.key)) });
  };

  const { statuses } = project;
  const pill = (status: string): React.JSX.Element => (
    <span className="pill" style={statusStyle(statuses, status)}>
      {statusName(statuses, status)}
    </span>
  );
  const doneStage = firstOfKind(statuses, "done");
  const tone = dueTone(issue, today(), config.dueSoonDays, statuses);

  const remove = async (): Promise<void> => {
    if (children.length > 0) {
      setError(M.issueHasChildren);
      return;
    }
    if (!window.confirm(M.confirmDelete(`${issue.key} ${issue.summary}`))) return;
    try {
      await window.api.issues.remove(issue.key);
      await refreshOne(issue.key);
      navigate("/issues");
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="issue-detail">
      <div className="issue-detail__head">
        <nav className="breadcrumb" aria-label="階層">
          <a href="#/issues">課題</a>
          {ancestors.map((a) => (
            <span key={a.key} className="breadcrumb__crumb">
              <span className="breadcrumb__sep" aria-hidden="true">›</span>
              <a href={`#/issues/${a.key}`}>
                {a.key} {a.summary}
              </a>
            </span>
          ))}
          <span className="breadcrumb__crumb">
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span className="issue-detail__key" aria-current="page">{issue.key}</span>
          </span>
        </nav>
        <div className="issue-detail__actions">
          {statusKind(statuses, issue.status) === "review" && issue.reporter === me.username && doneStage !== undefined && (
            <button type="button" className="button--primary" onClick={() => void save({ status: doneStage.id })}>
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
      {error && (
        <p className="text--error">
          {error}{" "}
          <button type="button" className="button--link" onClick={reload}>
            再読み込み
          </button>
        </p>
      )}
      <div className="issue-detail__body">
        <div className="issue-detail__main">
          <MarkdownField title="詳細" value={issue.description} onSave={(description) => save({ description })} preview={(v) => <Markdown source={v} />} />
          {(children.length > 0 || depth < MAX_DEPTH) && (
            <section>
              <div className="section-head">
                <h2>子課題</h2>
                {depth < MAX_DEPTH && (
                  <a className="button--quiet" href={`#/issues/new?parent=${issue.key}`}>
                    子課題を追加
                  </a>
                )}
              </div>
              {children.length === 0 ? (
                <p className="text--muted">{M.noChildIssues}</p>
              ) : (
                <table className="issue-table">
                  <thead>
                    <tr>
                      <th className="issue-table__header">キー</th>
                      <th className="issue-table__header">件名</th>
                      <th className="issue-table__header">状態</th>
                      <th className="issue-table__header">担当者</th>
                      <th className="issue-table__header">期限日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {children.map((c) => (
                      <tr key={c.key} className="issue-table__row" onClick={() => navigate(`/issues/${c.key}`)}>
                        <td className="issue-table__cell issue-table__cell--key">{c.key}</td>
                        <td className="issue-table__cell">{c.summary}</td>
                        <td className="issue-table__cell">
                          {pill(c.status)}
                        </td>
                        <td className="issue-table__cell">{displayNameOf(users, c.assignee)}</td>
                        <td className="issue-table__cell">{c.dueDate ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
          <section>
            <h2>関連課題</h2>
            {(rows.length > 0 || mentionRows.length > 0) && (
              <ul className="related">
                {rows.map((r) => (
                  <li key={`${r.direction}-${r.type}-${r.key}`} className="related__item">
                    <span className="related__type">{(r.direction === "out" ? RELATION_LABEL : INVERSE_LABEL)[r.type]}</span>{" "}
                    <a href={`#/issues/${r.key}`}>{r.key}</a> {r.summary}{" "}
                    {pill(r.status)}
                    {r.direction === "out" && (
                      <button type="button" className="button--link" aria-label="関連を外す" onClick={() => removeRelation(r)}>
                        ✕
                      </button>
                    )}
                  </li>
                ))}
                {mentionRows.map((m) => (
                  <li key={m.key} className="related__item">
                    <span className="related__type">本文で言及</span>{" "}
                    <a href={`#/issues/${m.key}`}>{m.key}</a> {m.summary}{" "}
                    {pill(m.status)}
                  </li>
                ))}
              </ul>
            )}
            <div className="related__add">
              <select className="issue-detail__control" aria-label="関連の種類" value={newRelationType} onChange={(e) => setNewRelationType(e.target.value as RelationType)}>
                {RELATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RELATION_LABEL[t]}
                  </option>
                ))}
              </select>
              <ParentField
                value={newRelationKey}
                candidates={relationCandidates}
                commitOn="change"
                className="issue-detail__control"
                ariaLabel="関連課題"
                onChange={(key, invalid) => {
                  setNewRelationKey(key);
                  setNewRelationInvalid(invalid);
                }}
              />
              <button type="button" className="button--quiet" disabled={relationBlocked} onClick={addNewRelation}>
                追加
              </button>
            </div>
          </section>
          <Attachments owner={{ kind: "issue", id: issue.key }} />
          <Comments issue={issue} version={version} onStatus={(status) => put({ status })} />
          <section>
            <h2>履歴</h2>
            <HistoryList
              issueKey={issue.key}
              version={version}
              onRestore={(old) =>
                save({
                  summary: old.summary,
                  description: old.description,
                  category: old.category,
                  labels: old.labels,
                  status: old.status,
                  priority: old.priority,
                  assignee: old.assignee,
                  startDate: old.startDate,
                  dueDate: old.dueDate,
                  fields: old.fields,
                })
              }
            />
          </section>
        </div>
        <aside className="issue-detail__side" aria-label="属性">
          <div className="issue-detail__prop">
            <span className="issue-detail__term">状態</span>
            <SelectField
              className="pill pill--select"
              style={statusStyle(statuses, issue.status)}
              ariaLabel="状態"
              value={issue.status}
              options={statuses.map((s) => ({ value: s.id, label: s.name }))}
              onSave={(status) => save({ status })}
            />
          </div>
          <div className="issue-detail__prop">
            <span className="issue-detail__term">種別</span>
            <SelectField
              className="issue-detail__control"
              ariaLabel="種別"
              value={issue.category}
              options={[...(issue.category === "" ? [{ value: "", label: "未設定" }] : []), ...categoryOptions(project, issue.category).map((c) => ({ value: c, label: c }))]}
              onSave={(category) => save({ category })}
            />
          </div>
          <div className="issue-detail__prop">
            <span className="issue-detail__term">ラベル</span>
            <LabelPicker project={project} value={issue.labels} onChange={(labels) => void save({ labels })} />
          </div>
          <div className="issue-detail__prop">
            <span className="issue-detail__term">優先度</span>
            <SelectField
              className="issue-detail__control"
              ariaLabel="優先度"
              value={issue.priority}
              options={ISSUE_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
              onSave={(priority) => save({ priority })}
            />
          </div>
          <div className="issue-detail__prop">
            <span className="issue-detail__term">担当者</span>
            <AssigneeSelect
              className="issue-detail__control"
              ariaLabel="担当者"
              value={issue.assignee ?? ""}
              users={users}
              leading={[{ value: "", label: "未設定" }]}
              onChange={(v) => void save({ assignee: v || null })}
            />
            {issue.assignee !== me.username && (
              <button type="button" className="button--link" onClick={() => void save({ assignee: me.username })}>
                自分にする
              </button>
            )}
          </div>
          <div className="issue-detail__prop">
            <span className="issue-detail__term">開始日</span>
            <DateField className="issue-detail__control" ariaLabel="開始日" value={issue.startDate} onSave={(startDate) => save({ startDate })} />
          </div>
          <div className={`issue-detail__prop${tone === "none" ? "" : ` issue-detail__prop--${tone}`}`}>
            <span className="issue-detail__term">期限日</span>
            <DateField className="issue-detail__control" ariaLabel="期限日" value={issue.dueDate} onSave={(dueDate) => save({ dueDate })} />
          </div>
          {project.fields.map((f) => {
            const value = issue.fields[f.id] ?? "";
            const saveField = (v: string): Promise<void> => save({ fields: { ...issue.fields, [f.id]: v } });
            return (
              <div key={f.id} className="issue-detail__prop">
                <span className="issue-detail__term">{f.name}</span>
                {f.options.length === 0 ? (
                  <TextField className="issue-detail__control" value={value} onSave={saveField} />
                ) : (
                  <SelectField
                    className="issue-detail__control"
                    ariaLabel={f.name}
                    value={value}
                    options={[{ value: "", label: "未設定" }, ...withCurrent(f.options, value).map((o) => ({ value: o, label: o }))]}
                    onSave={saveField}
                  />
                )}
              </div>
            );
          })}
          <div className="issue-detail__prop">
            <span className="issue-detail__term">親課題</span>
            <ParentField
              value={issue.parentKey}
              candidates={parentCandidates}
              commitOn="blur"
              className="issue-detail__control"
              ariaLabel="親課題"
              onChange={(key, invalid) => {
                if (!invalid && key !== issue.parentKey) void save({ parentKey: key });
              }}
            />
          </div>
          <div className="issue-detail__prop">
            <span className="issue-detail__term">登録者</span>
            <span>{displayNameOf(users, issue.reporter)}</span>
          </div>
          <div className="issue-detail__prop">
            <span className="issue-detail__term">登録日</span>
            <span>{formatDateTime(issue.createdAt)}</span>
          </div>
          <div className="issue-detail__prop">
            <span className="issue-detail__term">更新日</span>
            <span>
              {formatDateTime(issue.updatedAt)} {displayNameOf(users, issue.updatedBy)}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
