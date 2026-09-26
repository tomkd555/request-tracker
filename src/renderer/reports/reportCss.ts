// The report's own stylesheet: literal colours (an exported file carries no CSS tokens), inlined into the exported HTML
// and shown on screen through the same <style> tag, so the two agree pixel for pixel.

export const REPORT_CSS = `
.report-doc {
  background: #ffffff;
  color: #242424;
  font-family: "Segoe UI", "Yu Gothic UI", "Meiryo", sans-serif;
  font-size: 16px;
  line-height: 1.6;
}
.report-doc h1 { font-size: 24px; margin: 0 0 16px; }
.report-doc h2 { font-size: 20px; margin: 24px 0 8px; }
.report-doc h3 { font-size: 18px; margin: 16px 0 8px; }
.report-doc h4, .report-doc h5, .report-doc h6 { font-size: 16px; margin: 16px 0 8px; }
.report-doc p { margin: 0 0 8px; }
.report-doc table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0 16px;
  page-break-inside: avoid;
}
.report-doc th,
.report-doc td {
  border: 1px solid #cccccc;
  padding: 6px 8px;
  font-size: 14px;
  text-align: left;
}
.report-doc th { background: #f0f0f0; font-weight: 600; }
.report-doc h2, .report-doc h3, .report-doc h4 { break-after: avoid-page; page-break-after: avoid; }
.report-doc__nowrap { white-space: nowrap; }
.report-doc th.report-doc__num, .report-doc td.report-doc__num { text-align: right; width: 6em; }
.report-doc__scroll, .report-doc__summary { margin: 8px 0 16px; }
.report-doc__scroll { overflow-x: auto; }
.report-doc__scroll table { margin: 0; }
.report-doc__summary table { margin: 0 0 8px; }
.report-doc__summary table:last-child { margin-bottom: 0; }
.report-doc__cut, .report-doc__key { margin: 4px 0 0; font-size: 14px; color: #737373; }
.report-doc__key-swatch { display: inline-block; width: 14px; height: 14px; margin: 0 4px 0 12px; vertical-align: -2px; background: #a9c4dd; }
.report-doc__key-swatch:first-child { margin-left: 0; }
.report-doc__key-swatch.report-doc__gantt-bar--overdue { background: #efc3bd; }
.report-doc__key-swatch.report-doc__gantt-bar--muted { background: #d8d8d8; }
.report-doc__key-swatch.report-doc__gantt-late { background: #e06b5c; }
.report-doc__key-swatch.report-doc__gantt-today { background: #fae9d3; }
@media (max-width: 700px) {
  .report-doc__issues { min-width: 640px; }
}
.report-doc__invalid,
.report-doc__empty { color: #737373; font-size: 14px; }
.report-doc__month { font-size: 14px; font-weight: 600; margin: 0 0 4px; }
.report-doc__gantt {
  display: block;
  page-break-inside: avoid;
}
.report-doc__gantt text { font-size: 14px; fill: #242424; }
.report-doc__gantt-month { font-weight: 600; }
.report-doc__gantt-group { fill: #edf5f0; }
.report-doc__gantt-group-label { font-weight: 600; }
.report-doc__gantt-weekend { fill: #f0f0f0; }
.report-doc__gantt-today { fill: #fae9d3; }
.report-doc__gantt-bar { fill: #a9c4dd; }
.report-doc__gantt-bar--overdue { fill: #efc3bd; }
.report-doc__gantt-bar--muted { fill: #d8d8d8; }
.report-doc__gantt-bracket { fill: none; stroke: #7a8a99; stroke-width: 2; }
.report-doc__gantt-late { fill: #e06b5c; }
@page { size: A4; margin: 18mm; }
@media print {
  .report-doc { background: #ffffff; color: #242424; }
  .report-doc__scroll { overflow: visible; }
  .report-doc__gantt { max-width: 100%; height: auto; }
  .report-doc__issues { min-width: 0; }
}
`;
