import { createElement, isValidElement, useContext } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { WikiContext } from "../wiki/useWiki";
import { normalizeTitle } from "../wiki/wikiTree";
import { linkIssueKeys } from "./linkIssueKeys";
import { linkWikiPages, MISSING_PAGE_PATH } from "./wikiLinks";

type Level = 1 | 2 | 3 | 4 | 5 | 6;

/** The id a heading gets, so a table of contents can point at it: its text with spaces as hyphens. */
export const headingId = (text: string): string => text.trim().replace(/\s+/g, "-");

const textOf = (node: React.ReactNode): string => {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return "";
};

/** Headings written in Markdown render `demote` ranks lower, so a screen's own h1/h2 stay above the content. */
function components(demote: number): Components {
  const out: Components = {
    a: ({ node: _node, href, ...props }) => <a href={href} className={href?.startsWith(MISSING_PAGE_PATH) ? "link--missing" : undefined} {...props} />,
  };
  for (const level of [1, 2, 3, 4, 5, 6] as Level[]) {
    const tag = `h${Math.min(6, level + demote)}`;
    out[`h${level}`] = ({ node: _node, ...props }) => createElement(tag, { ...props, id: headingId(textOf(props.children)) });
  }
  return out;
}

const COMPONENTS: Record<number, Components> = { 1: components(1), 2: components(2) };

type Props = {
  source: string;
  /** 2 under an h2 section (issue description, comments); 1 under a page title (wiki). */
  demote?: 1 | 2;
  /** The page a `[[missing title]]` link creates its page under. */
  wikiParentId?: string | null;
};

/**
 * Markdown with raw HTML left as text (no rehype-raw): a `<script>` tag in the source renders literally.
 * Issue keys and `[[page titles]]` become links; a title with no page links to the new-page form.
 */
export function Markdown({ source, demote = 2, wikiParentId = null }: Props): React.JSX.Element {
  const wiki = useContext(WikiContext);
  const resolve = (title: string): string | null => wiki?.titles.get(normalizeTitle(title)) ?? null;
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS[demote]}>{linkWikiPages(linkIssueKeys(source), resolve, wikiParentId)}</ReactMarkdown>
    </div>
  );
}
