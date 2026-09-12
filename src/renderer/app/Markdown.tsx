import ReactMarkdown from "react-markdown";

/** Markdown with raw HTML left as text (no rehype-raw): a `<script>` tag in the source renders literally. */
export function Markdown({ source }: { source: string }): React.JSX.Element {
  return (
    <div className="markdown">
      <ReactMarkdown>{source}</ReactMarkdown>
    </div>
  );
}
