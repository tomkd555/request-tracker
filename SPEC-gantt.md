# Spec: gantt

Module id `gantt`. Depends on `issues`. Inherits the shared sections of `SPEC.md`.

## Objective

Show issues as bars on a day grid so the team sees what is due when. Read-only.

## Screens

- **Gantt** (`/gantt`). Left column: issue key and summary, parents first, children indented beneath. Right: one column per day for the visible range. Header rows show month and day; weekends shaded; a vertical line marks today. Buttons: 前月, 今月, 次月. Row click opens the issue detail.

## Behaviour

- Visible range: first day of the selected month minus 7 days to last day plus 7 days.
- An issue appears when it has a `dueDate`. Bar start is `startDate`, or the date part of `createdAt` when `startDate` is null. Bar end is `dueDate`.
- Bars for issues that are open or in progress with `dueDate` before today use the overdue colour; closed and resolved issues use a muted colour.
- Filter: same 状態 filter as the issue list, default all except 完了.
- Layout is a pure function `layoutGantt(issues, range) → { rows: { key, summary, depth, startCol, span, tone }[], days: string[] }`, rendered with CSS grid. No chart library. `// ponytail: no drag to reschedule; edit dates in the detail screen`.

## Success Criteria

- An issue due within the month shows one bar spanning from its start to its due column inclusive.
- An issue with no `dueDate` is absent from the chart.
- An open issue due yesterday shows the overdue tone; the same issue closed shows the muted tone.
- `layoutGantt` has a vitest test for each of: inside range, start before range, due after range, child under parent.
