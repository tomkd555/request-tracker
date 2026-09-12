import { STATUS_LABEL } from "./labels";
import { useIssues } from "./useIssues";

// Minimal list for Task 5; Task 6 adds filters and parent/child rows.
export function IssueList(): React.JSX.Element {
  const { issues } = useIssues();
  const sorted = [...issues].sort((a, b) => (a.key < b.key ? 1 : -1));
  return (
    <div>
      <div className="toolbar">
        <h1>課題</h1>
        <a className="button" href="#/issues/new">
          課題を追加
        </a>
      </div>
      <table className="issue-table">
        <thead>
          <tr>
            <th>キー</th>
            <th>件名</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((i) => (
            <tr key={i.key} onClick={() => (window.location.hash = `/issues/${i.key}`)}>
              <td>{i.key}</td>
              <td>{i.summary}</td>
              <td>{STATUS_LABEL[i.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
