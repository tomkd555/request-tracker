import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { M } from "../messages";
import { expandVariables, parseBody, type ReportContent, type ReportContext, type Segment } from "./blocks";
import { GanttSvg } from "./GanttSvg";
import { IssuesTable } from "./IssuesTable";
import { SummaryTables } from "./SummaryTables";

type Level = 1 | 2 | 3 | 4 | 5 | 6;
const LEVELS: Level[] = [1, 2, 3, 4, 5, 6];

/** The body's headings shift so its top level renders as h2 under the title, whether the author wrote `#` or `##`. */
function headingComponents(shift: number): Components {
  const out: Components = {};
  for (const level of LEVELS) {
    const Tag = `h${Math.min(6, Math.max(2, level + shift))}` as "h2" | "h3" | "h4" | "h5" | "h6";
    out[`h${level}`] = ({ node: _node, ...props }) => <Tag {...props} />;
  }
  return out;
}

const HEADING_LINE = /^ {0,3}(#{1,6})\s/;

/** The smallest heading rank the Markdown runs use, or null with no heading at all. */
function topLevel(segments: Segment[]): number | null {
  let min: number | null = null;
  for (const seg of segments) {
    if (seg.kind !== "markdown") continue;
    for (const line of seg.text.split("\n")) {
      const m = HEADING_LINE.exec(line);
      if (m && (min === null || m[1].length < min)) min = m[1].length;
    }
  }
  return min;
}

type Props = {
  report: ReportContent;
  ctx: ReportContext;
  /** The view screen carries the title in its toolbar already. */
  withTitle?: boolean;
  /** The exported file leaves a line the author has yet to fix out; the author sees it on screen. */
  withInvalid?: boolean;
};

/**
 * A report rendered from its Markdown body: the title, then each Markdown run and `::issues`/`::summary`/`::gantt`
 * block in order. Raw HTML in the body stays text (no rehype-raw); issue keys stay plain text (the reader has no app).
 */
export function ReportDocument({ report, ctx, withTitle = true, withInvalid = true }: Props): React.JSX.Element {
  const segments = parseBody(report.body);
  const top = topLevel(segments);
  const components = headingComponents(top === null ? 1 : 2 - top);
  return (
    <article className="report-doc">
      {withTitle && <h1>{report.title}</h1>}
      {segments.map((seg, i) => {
        if (seg.kind === "markdown") {
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={components}>
              {expandVariables(seg.text, ctx, report.terms)}
            </ReactMarkdown>
          );
        }
        if (seg.kind === "invalid") {
          if (!withInvalid) return null;
          return (
            <p key={i} className="report-doc__invalid">
              {M.blockInvalid(seg.line)}
            </p>
          );
        }
        switch (seg.block.kind) {
          case "issues":
            return <IssuesTable key={i} block={seg.block} report={report} ctx={ctx} />;
          case "summary":
            return <SummaryTables key={i} block={seg.block} report={report} ctx={ctx} />;
          case "gantt":
            return <GanttSvg key={i} block={seg.block} report={report} ctx={ctx} />;
        }
      })}
    </article>
  );
}
