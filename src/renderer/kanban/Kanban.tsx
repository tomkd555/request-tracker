import { useState } from "react";
import { textOn, TYPE_PILL_DEFAULT } from "../app/theme";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { columnsOf } from "./columns";
import { today } from "../issues/dates";
import { dueTone } from "../issues/dueTone";
import { FilterBar } from "../issues/FilterBar";
import { DEFAULT_FILTER, filterIssues, type IssueFilter } from "../issues/filterIssues";
import { formatDate, labelColor, STATUS_LABEL } from "../issues/labels";
import { staleMessage } from "../issues/saveError";
import { isUnseen } from "../issues/seen";
import { SavedFilters } from "../issues/SavedFilters";
import { DEFAULT_SORT, issueComparator } from "../issues/sortIssues";
import { useIssues } from "../issues/useIssues";
import type { Issue, IssueStatus } from "../../shared/types";
import "./kanban.css";

const KEY_MIME = "text/plain";

export function Kanban(): React.JSX.Element {
  const { me, users, project, config } = useSession();
  const { issues, byKey, refreshOne } = useIssues();
  const [filter, setFilter] = useState<IssueFilter>(DEFAULT_FILTER);
  const [message, setMessage] = useState<string | null>(null);
  const day = today();
  const nameOf = (u: string | null): string => displayNameOf(users, u);
  const columns = columnsOf(filterIssues(issues, filter, day, me.username), filter.statuses, issueComparator(DEFAULT_SORT, nameOf));

  const drop = async (status: IssueStatus, e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    const key = e.dataTransfer.getData(KEY_MIME);
    const issue = byKey.get(key);
    if (!issue || issue.status === status) return;
    setMessage(null);
    try {
      await window.api.issues.put({ ...issue, status, updatedAt: new Date().toISOString(), updatedBy: me.username }, issue.updatedAt);
      await refreshOne(key);
    } catch (err) {
      setMessage(staleMessage(err));
      await refreshOne(key); // the record on disk is unchanged, so the card renders back in its original column
    }
  };

  const card = (i: Issue): React.JSX.Element => {
    const tone = dueTone(i, day, config.dueSoonDays);
    const categoryColor = project.categoryColors[i.category] ?? TYPE_PILL_DEFAULT;
    return (
      <article
        key={i.key}
        className="kanban-card"
        draggable
        onDragStart={(e) => e.dataTransfer.setData(KEY_MIME, i.key)}
        onClick={() => navigate(`/issues/${i.key}`)}
      >
        <div className="kanban-card__head">
          {isUnseen(i, me.username) && <span className="issue-table__unseen" role="img" aria-label="更新あり" />}
          <span className="kanban-card__key">{i.key}</span>
          {i.priority === "high" && <span className="kanban-card__priority">高</span>}
        </div>
        {i.parentKey !== null && (
          <a className="kanban-card__parent" href={`#/issues/${i.parentKey}`} onClick={(e) => e.stopPropagation()}>
            ↳ {i.parentKey}
          </a>
        )}
        <p className="kanban-card__summary">{i.summary}</p>
        <div className="kanban-card__tags">
          {i.category !== "" && (
            <span className="pill" style={{ background: categoryColor, color: textOn(categoryColor) }}>
              {i.category}
            </span>
          )}
          {i.labels.map((name) => {
            const color = labelColor(project, name);
            return (
              <span key={name} className="pill issue-table__label" style={{ background: color, color: textOn(color) }}>
                {name}
              </span>
            );
          })}
        </div>
        <div className="kanban-card__foot">
          <span className="kanban-card__assignee">{nameOf(i.assignee)}</span>
          {i.dueDate !== null && <span className={`kanban-card__due${tone === "none" ? "" : ` kanban-card__due--${tone}`}`}>{formatDate(i.dueDate)}</span>}
        </div>
      </article>
    );
  };

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">カンバン</h1>
      </header>
      {message && <p className="text--error">{message}</p>}
      <FilterBar filter={filter} users={users} onChange={setFilter} />
      <SavedFilters filter={filter} onChange={setFilter} />
      <div className="kanban">
        {columns.map((col) => (
          <div key={col.status} className="kanban-column" onDragOver={(e) => e.preventDefault()} onDrop={(e) => void drop(col.status, e)}>
            <div className="kanban-column__head">
              <span className={`kanban-column__dot kanban-column__dot--${col.status}`} aria-hidden="true" />
              {STATUS_LABEL[col.status]}
            </div>
            <div className="kanban-column__cards">
              {col.cards.map(card)}
              {col.overflow > 0 && <p className="kanban-column__overflow">他 {col.overflow} 件</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
