import { useState } from "react";
import { useSession } from "../app/UserContext";
import { navigate } from "../app/useHashRoute";
import { FilterBar } from "../issues/FilterBar";
import { DEFAULT_FILTER, filterIssues, type IssueFilter } from "../issues/filterIssues";
import { useIssues } from "../issues/useIssues";
import { isWeekend, layoutGantt, rangeForMonth, ymd } from "./layoutGantt";
import "./gantt.css";

const DAY_PX = 28;
const LABEL_PX = 320;

const thisMonth = (): string => ymd(new Date()).slice(0, 7);
const shiftMonth = (month: string, by: number): string => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1);
  return ymd(d).slice(0, 7);
};

export function Gantt(): React.JSX.Element {
  const { users } = useSession();
  const { issues } = useIssues();
  const [month, setMonth] = useState(thisMonth());
  const [filter, setFilter] = useState<IssueFilter>(DEFAULT_FILTER);
  const range = rangeForMonth(month);
  const { days, rows, todayCol } = layoutGantt(filterIssues(issues, filter), range, ymd(new Date()));
  const gridWidth = LABEL_PX + days.length * DAY_PX;

  return (
    <div>
      <div className="toolbar">
        <h1>ガントチャート</h1>
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
          <span className="gantt-month">{month.replace("-", "/")}</span>
        </div>
      </div>
      <FilterBar filter={filter} users={users} onChange={setFilter} />
      <div className="gantt-scroll">
        <div className="gantt" style={{ width: gridWidth, gridTemplateColumns: `${LABEL_PX}px repeat(${days.length}, ${DAY_PX}px)` }}>
          <div className="gantt-corner">件名</div>
          {days.map((d, i) => (
            <div key={d} className={`gantt-day ${isWeekend(d) ? "weekend" : ""} ${i === todayCol ? "today" : ""}`}>
              {d.slice(8) === "01" || i === 0 ? <span className="gantt-month-label">{d.slice(5, 7)}/</span> : null}
              {Number(d.slice(8))}
            </div>
          ))}
          {rows.map((r) => (
            <div key={r.key} className="gantt-row" style={{ display: "contents" }} onClick={() => navigate(`/issues/${r.key}`)}>
              <div className={`gantt-label depth-${r.depth}`}>
                <span className="col-key">{r.key}</span> {r.summary}
              </div>
              {days.map((d, i) => (
                <div key={d} className={`gantt-cell ${isWeekend(d) ? "weekend" : ""} ${i === todayCol ? "today" : ""}`}>
                  {i === r.startCol && <div className={`gantt-bar tone-${r.tone}`} style={{ width: r.span * DAY_PX - 4 }} />}
                </div>
              ))}
            </div>
          ))}
          {rows.length === 0 && <div className="gantt-empty">期限日のある課題はありません</div>}
        </div>
      </div>
    </div>
  );
}
