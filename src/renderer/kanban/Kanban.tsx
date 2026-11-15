import { useState } from "react";
import { useChoiceDialog } from "../app/ChoiceDialog";
import { textOn } from "../app/theme";
import { displayNameOf, useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { columnsOf } from "./columns";
import { today } from "../issues/dates";
import { dueTone } from "../issues/dueTone";
import { FilterBar } from "../issues/FilterBar";
import { defaultFilter, filterIssues, type IssueFilter } from "../issues/filterIssues";
import { categoryColor as categoryColorOf, formatDate, isDoneStatus, labelColor, statusOf } from "../issues/labels";
import { applyWrites, completionWrites, openDescendants, type ParentAnswer } from "../issues/parentOps";
import { carrySeen, isUnseen } from "../issues/seen";
import { ProgressCount } from "../issues/TreeCells";
import { SavedFilters } from "../issues/SavedFilters";
import { DEFAULT_SORT, issueComparator } from "../issues/sortIssues";
import { useIssues } from "../issues/useIssues";
import { ancestorsOf, descendantCounts } from "../../shared/issueTree";
import type { Issue, IssueStatus } from "../../shared/types";
import "./kanban.css";
import { errorMessage, M } from "../messages";

const KEY_MIME = "text/plain";

export function Kanban(): React.JSX.Element {
  const { me, users, project, config } = useSession();
  const { issues, byKey, refreshOne } = useIssues();
  const [filter, setFilter] = useState<IssueFilter>(() => defaultFilter(project.statuses));
  const [message, setMessage] = useState<string | null>(null);
  const { ask, dialog } = useChoiceDialog();
  const day = today();
  const nameOf = (u: string | null): string => displayNameOf(users, u);
  const counts = descendantCounts(issues, (i) => isDoneStatus(project.statuses, i.status));
  const columns = columnsOf(filterIssues(issues, filter, day, me.username, project.statuses, project.milestones), project.statuses, filter.statuses, issueComparator(DEFAULT_SORT, nameOf, project.statuses));

  const drop = async (status: IssueStatus, e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    const key = e.dataTransfer.getData(KEY_MIME);
    const issue = byKey.get(key);
    if (!issue || issue.status === status) return;
    setMessage(null);
    let touched = [key];
    try {
      let answer: ParentAnswer = "only";
      const open = isDoneStatus(project.statuses, status) ? openDescendants(issues, key, project.statuses).length : 0;
      if (open > 0) answer = await ask(M.openDescendants(open), "配下も完了にする");
      if (answer === "cancel") return;
      const writes = completionWrites(issues, issue, status, answer, project.statuses, { updatedAt: new Date().toISOString(), updatedBy: me.username });
      touched = writes.map((w) => w.next.key);
      await applyWrites(writes, (next, expected) => window.api.issues.put(next, expected), (next) => carrySeen(byKey.get(next.key) ?? issue, next, me.username));
    } catch (err) {
      setMessage(errorMessage(err));
    }
    // A failed first write leaves the record on disk unchanged, so the card renders back in its original column.
    for (const k of touched) await refreshOne(k);
  };

  const card = (i: Issue): React.JSX.Element => {
    const tone = dueTone(i, day, config.dueSoonDays, project.statuses);
    const categoryColor = categoryColorOf(project, i.category);
    const ancestors = ancestorsOf(byKey, i.key);
    const parent = ancestors[ancestors.length - 1];
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
          <ProgressCount count={counts.get(i.key)} />
        </div>
        {i.parentKey !== null && (
          <a
            className="kanban-card__parent"
            href={`#/issues/${i.parentKey}`}
            title={ancestors.map((a) => `${a.key} ${a.summary}`).join(" › ")}
            onClick={(e) => e.stopPropagation()}
          >
            ↳ {i.parentKey}
            {parent !== undefined && ` ${parent.summary}`}
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
      {dialog}
      <FilterBar filter={filter} users={users} onChange={setFilter} />
      <SavedFilters filter={filter} onChange={setFilter} />
      <div className="kanban">
        {columns.map((col) => (
          <div key={col.status} className="kanban-column" onDragOver={(e) => e.preventDefault()} onDrop={(e) => void drop(col.status, e)}>
            <div className="kanban-column__head">
              <span className="kanban-column__dot" style={{ background: statusOf(project.statuses, col.status).color }} aria-hidden="true" />
              {statusOf(project.statuses, col.status).name}
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
