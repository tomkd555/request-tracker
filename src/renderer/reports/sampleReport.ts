// The built-in starting point offered on the new-report form beside the project's own templates.
export const SAMPLE_TITLE = "月次報告";

export const SAMPLE_BODY = `作成日: {{today}}

作成者: {{me}}

## 状態別の件数

::summary {"mode":"now","tables":["status"]}

## 今月の対応

::issues {"updatedIn":"current","columns":["key","summary","assignee","status","dueDate","note"],"sort":"dueDate"}

## 日程

::gantt {"month":"current","months":2}

## 所感

`;
