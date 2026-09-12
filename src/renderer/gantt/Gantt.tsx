import { useState } from "react";
import { useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { FilterBar } from "../issues/FilterBar";
import { DEFAULT_FILTER, filterIssues, type IssueFilter } from "../issues/filterIssues";
import { useIssues } from "../issues/useIssues";
import { ymd } from "../issues/dates";
import { isWeekend, layoutGantt, rangeForMonth } from "./layoutGantt";
import "./gantt.css";

const DAY_PX = 28;
const LABEL_PX = 320;

const thisMonth = (): string => ymd(new Date()).slice(0, 7);
const shiftMonth = (month: string, by: number): string => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1);
  return ymd(d).slice(0, 7);
};

export function Gantt(): React.JSX.Element {
  const { me, users } = useSession();
  const { issues } = useIssues();
  const [month, setMonth] = useState(thisMonth());
  const [filter, setFilter] = useState<IssueFilter>(DEFAULT_FILTER);
  const range = rangeForMonth(month);
  const today = ymd(new Date());
  const { days, rows, todayCol } = layoutGantt(filterIssues(issues, filter, today, me.username), range, today);
  const gridWidth = LABEL_PX + days.length * DAY_PX;

  return (
    <div>
      <header className="toolbar">
        <h1 className="toolbar__heading">ガントチャート</h1>
        <div className="form-actions">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            前月
          </button>
          <button type="button" onClick={() => setMonth(thisMonth())}>
            今月
          </button>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            次月
          </button>
          <span className="gantt__month">{month.replace("-", "/")}</span>
        </div>
      </header>
      <FilterBar filter={filter} users={users} onChange={setFilter} />
      <div className="gantt__scroll">
        <div className="gantt" style={{ width: gridWidth, gridTemplateColumns: `${LABEL_PX}px repeat(${days.length}, ${DAY_PX}px)` }}>
          <div className="gantt__corner">件名</div>
          {days.map((d, i) => (
            <div
              key={d}
              className={`gantt__day${isWeekend(d) ? " gantt__day--weekend" : ""}${i === todayCol ? " gantt__day--today" : ""}`}
            >
              {d.slice(8) === "01" || i === 0 ? <span className="gantt__month-label">{Number(d.slice(5, 7))}/</span> : null}
              <span>{Number(d.slice(8))}</span>
            </div>
          ))}
          {rows.map((r) => (
            <div key={r.key} className="gantt__row" style={{ display: "contents" }} onClick={() => navigate(`/issues/${r.key}`)}>
              <div className={`gantt__label${r.depth === 1 ? " gantt__label--child" : ""}`}>
                <span className="gantt__key">{r.key}</span> {r.summary}
              </div>
              {days.map((d, i) => (
                <div
                  key={d}
                  className={`gantt__cell${isWeekend(d) ? " gantt__cell--weekend" : ""}${i === todayCol ? " gantt__cell--today" : ""}`}
                >
                  {i === r.startCol && (
                    <div
                      className={`gantt__bar${r.tone !== "normal" ? ` gantt__bar--${r.tone}` : ""}`}
                      style={{ width: r.span * DAY_PX - 4 }}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
          {rows.length === 0 && <div className="gantt__empty">期限日のある課題はありません</div>}
        </div>
      </div>
    </div>
  );
}
