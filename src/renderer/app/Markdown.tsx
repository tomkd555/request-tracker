import ReactMarkdown from "react-markdown";
import { linkIssueKeys } from "./linkIssueKeys";

/** Markdown with raw HTML left as text (no rehype-raw): a `<script>` tag in the source renders literally. Issue keys become links. */
export function Markdown({ source }: { source: string }): React.JSX.Element {
  return (
    <div className="markdown">
      <ReactMarkdown>{linkIssueKeys(source)}</ReactMarkdown>
    </div>
  );
}
