import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingIdOf, linkProps, makeIdAllocator } from "../app/anchorLink";
import { codeLineFlags } from "../app/markdownCode";
import { M } from "../messages";
import { expandVariables, parseBody, type BodySegment, type ReportContent, type ReportContext } from "./blocks";
import { GanttSvg } from "./GanttSvg";
import { IssuesTable } from "./IssuesTable";
import { SummaryTables } from "./SummaryTables";

type Level = 1 | 2 | 3 | 4 | 5 | 6;
const LEVELS: Level[] = [1, 2, 3, 4, 5, 6];

/**
 * The body's headings shift so its top level renders as h2 under the title, whether the author wrote `#` or `##`.
 * Each heading takes the id `idOf` returns for its text and its offset in the run, so a link `[x](#見出し)` reaches it.
 */
function markdownComponents(headingShift: number, idOf: (id: string, offset: number | undefined) => string): Components {
  const out: Components = {
    a: ({ node: _node, href, ...props }) => <a href={href} {...linkProps(href)} {...props} />,
  };
  for (const level of LEVELS) {
    const Tag = `h${Math.min(6, Math.max(2, level + headingShift))}` as "h2" | "h3" | "h4" | "h5" | "h6";
    out[`h${level}`] = ({ node, ...props }) => <Tag {...props} id={idOf(headingIdOf(props.children), node?.position?.start.offset)} />;
  }
  return out;
}

const HEADING_LINE = /^ {0,3}(#{1,6})\s/;

/** The smallest heading rank the Markdown runs use outside code, or null with no heading at all. */
export function topHeadingLevel(segments: BodySegment[]): number | null {
  let min: number | null = null;
  for (const seg of segments) {
    if (seg.kind !== "markdown") continue;
    const lines = seg.text.split("\n");
    const code = codeLineFlags(lines);
    for (const [i, line] of lines.entries()) {
      if (code[i]) continue;
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
  showTitle?: boolean;
  /** The exported file leaves a line the author has yet to fix out; the author sees it on screen. */
  showInvalid?: boolean;
};

/**
 * A report rendered from its Markdown body: the title, then each Markdown run and `::issues`/`::summary`/`::gantt`
 * block in order. Raw HTML in the body stays text (no rehype-raw); issue keys stay plain text (the reader has no app).
 */
export function ReportDocument({ report, ctx, showTitle = true, showInvalid = true }: Props): React.JSX.Element {
  const segments = parseBody(report.body);
  const top = topHeadingLevel(segments);
  const headingShift = top === null ? 1 : 2 - top;
  // One allocator for the document: a heading repeated in a later Markdown run still gets an id of its own.
  const nextId = makeIdAllocator();
  return (
    <article className="report-doc">
      {showTitle && <h1>{report.title}</h1>}
      {segments.map((seg, i) => {
        if (seg.kind === "markdown") {
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents(headingShift, (id, offset) => nextId(id, `${i}:${offset}`))}>
              {expandVariables(seg.text, ctx, report.terms)}
            </ReactMarkdown>
          );
        }
        if (seg.kind === "invalid") {
          if (!showInvalid) return null;
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
