import { createElement } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { linkIssueKeys } from "./linkIssueKeys";

type Level = 1 | 2 | 3 | 4 | 5 | 6;

/** Headings written in Markdown render `demote` ranks lower, so a screen's own h1/h2 stay above the content. */
function demotedHeadings(demote: number): Components {
  const out: Components = {};
  for (const level of [1, 2, 3, 4, 5, 6] as Level[]) {
    const tag = `h${Math.min(6, level + demote)}`;
    out[`h${level}`] = ({ node: _node, ...props }) => createElement(tag, props);
  }
  return out;
}

const COMPONENTS: Record<number, Components> = { 1: demotedHeadings(1), 2: demotedHeadings(2) };

/**
 * Markdown with raw HTML left as text (no rehype-raw): a `<script>` tag in the source renders literally. Issue keys become links.
 * `demote` is 2 under an h2 section (issue description, comments) and 1 under a page title (wiki).
 */
export function Markdown({ source, demote = 2 }: { source: string; demote?: 1 | 2 }): React.JSX.Element {
  return (
    <div className="markdown">
      <ReactMarkdown components={COMPONENTS[demote]}>{linkIssueKeys(source)}</ReactMarkdown>
    </div>
  );
}
