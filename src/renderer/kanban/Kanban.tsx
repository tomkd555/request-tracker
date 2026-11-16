import { useState } from "react";
import { useChoiceDialog } from "../app/ChoiceDialog";
import { textOn } from "../app/theme";
import { displayNameOf, useSession } from "../app/SessionContext";
import { navigate } from "../app/useHashRoute";
import { columnsOf } from "./columns";
import { todayYmd } from "../issues/dates";
import { dueTone } from "../issues/dueTone";
import { FilterBar } from "../issues/FilterBar";
import { defaultFilter, filterIssues } from "../issues/filterIssues";
import { categoryColor, formatDate, isDoneStatus, labelColor, statusOf } from "../issues/labels";
import { applyWrites, completionWrites, openDescendants, type ParentAnswer } from "../issues/parentOps";
import { markOwnSave, isUnseen } from "../issues/seen";
import { ProgressCount } from "../issues/TreeCells";
import { SavedFilters } from "../issues/SavedFilters";
import { DEFAULT_SORT, issueComparator } from "../issues/sortIssues";
import { useIssues } from "../issues/useIssues";
import { ancestorsOf, descendantCounts } from "../../shared/issueTree";
import type { Issue, IssueFilter, IssueStatus } from "../../shared/types";
import "./kanban.css";
import { errorMessage, M } from "../messages";

const ISSUE_KEY_MIME = "text/plain";

export function Kanban(): React.JSX.Element {
  const { me, users, project, config } = useSession();
  const { issues, byKey, refreshOne } = useIssues();
  const [filter, setFilter] = useState<IssueFilter>(() => defaultFilter(project.statuses));
  const [error, setError] = useState<string | null>(null);
  const { ask, dialog } = useChoiceDialog();
  const today = todayYmd();
  const nameOf = (u: string | null): string => displayNameOf(users, u);
  const progressCounts = descendantCounts(issues, (i) => isDoneStatus(project.statuses, i.status));
  const shownIssues = filterIssues(issues, filter, today, me.username, project.statuses, project.milestones ?? []);
  const byDefaultOrder = issueComparator(DEFAULT_SORT, nameOf, project.statuses);
  const columns = columnsOf(shownIssues, project.statuses, filter.statuses, byDefaultOrder);

  const moveCardTo = async (status: IssueStatus, e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    const key = e.dataTransfer.getData(ISSUE_KEY_MIME);
    const issue = byKey.get(key);
    if (!issue || issue.status === status) return;
    setError(null);
    let touched = [key];
    try {
      let answer: ParentAnswer = "only";
      const openCount = isDoneStatus(project.statuses, status) ? openDescendants(issues, key, project.statuses).length : 0;
      if (openCount > 0) answer = await ask(M.openDescendants(openCount), "配下も完了にする");
      if (answer === "cancel") return;
      const writes = completionWrites(issues, issue, status, answer, project.statuses, { updatedAt: new Date().toISOString(), updatedBy: me.username });
      touched = writes.map((w) => w.next.key);
      await applyWrites(writes, (next, expected) => window.api.issues.put(next, expected), (next) => markOwnSave(byKey.get(next.key) ?? issue, next, me.username));
    } catch (err) {
      setError(errorMessage(err));
    }
    // A failed first write leaves the record on disk unchanged, so the card renders back in its original column.
    try {
      for (const touchedKey of touched) await refreshOne(touchedKey);
    } catch (err) {
      // a failed save's message stays; it names the first thing that went wrong
      setError((shownError) => shownError ?? errorMessage(err));
    }
  };

  const renderCard = (issue: Issue): React.JSX.Element => {
    const tone = dueTone(issue, today, config.dueSoonDays, project.statuses);
    const categoryBg = categoryColor(project, issue.category);
    const ancestors = ancestorsOf(byKey, issue.key);
    const parent = ancestors[ancestors.length - 1];
    return (
      <article
        key={issue.key}
        className="kanban-card"
        draggable
        onDragStart={(e) => e.dataTransfer.setData(ISSUE_KEY_MIME, issue.key)}
        onClick={() => navigate(`/issues/${issue.key}`)}
      >
        <div className="kanban-card__head">
          {isUnseen(issue, me.username) && <span className="issue-table__unseen" role="img" aria-label="更新あり" />}
          <span className="kanban-card__key">{issue.key}</span>
          {issue.priority === "high" && <span className="kanban-card__priority">高</span>}
          <ProgressCount count={progressCounts.get(issue.key)} />
        </div>
        {issue.parentKey !== null && (
          <a
            className="kanban-card__parent"
            href={`#/issues/${issue.parentKey}`}
            title={ancestors.map((a) => `${a.key} ${a.summary}`).join(" › ")}
            onClick={(e) => e.stopPropagation()}
          >
            ↳ {issue.parentKey}
            {parent !== undefined && ` ${parent.summary}`}
          </a>
        )}
        <p className="kanban-card__summary">{issue.summary}</p>
        <div className="kanban-card__tags">
          {issue.category !== "" && (
            <span className="pill" style={{ background: categoryBg, color: textOn(categoryBg) }}>
              {issue.category}
            </span>
          )}
          {issue.labels.map((name) => {
            const color = labelColor(project, name);
            return (
              <span key={name} className="pill issue-table__label" style={{ background: color, color: textOn(color) }}>
                {name}
              </span>
            );
          })}
        </div>
        <div className="kanban-card__foot">
          <span className="kanban-card__assignee">{nameOf(issue.assignee)}</span>
          {issue.dueDate !== null && <span className={`kanban-card__due${tone === "none" ? "" : ` kanban-card__due--${tone}`}`}>{formatDate(issue.dueDate)}</span>}
        </div>
      </article>
    );
  };

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">カンバン</h1>
      </header>
      {error && <p className="text--error">{error}</p>}
      {dialog}
      <FilterBar filter={filter} onChange={setFilter} />
      <SavedFilters filter={filter} onChange={setFilter} />
      <div className="kanban">
        {columns.map((column) => {
          const stage = statusOf(project.statuses, column.status);
          return (
            <div key={column.status} className="kanban-column" onDragOver={(e) => e.preventDefault()} onDrop={(e) => void moveCardTo(column.status, e)}>
              <div className="kanban-column__head">
                <span className="kanban-column__dot" style={{ background: stage.color }} aria-hidden="true" />
                {stage.name}
              </div>
              <div className="kanban-column__cards">
                {column.cards.map(renderCard)}
                {column.hiddenCount > 0 && <p className="kanban-column__overflow">他 {column.hiddenCount} 件</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
