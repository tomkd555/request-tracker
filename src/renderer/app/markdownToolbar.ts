// Toolbar commands over a textarea's value and selection. Pure, so the buttons stay a thin layer.

export type ToolbarCommand = "heading" | "bold" | "ul" | "ol" | "check" | "code" | "link" | "table" | "wikiLink" | "issueKey";

export interface Selection { text: string; start: number; end: number }

export const TOOLBAR_LABEL: Record<ToolbarCommand, string> = {
  heading: "見出し",
  bold: "太字",
  ul: "箇条書き",
  ol: "番号付き",
  check: "チェック",
  code: "コード",
  link: "リンク",
  table: "表",
  wikiLink: "ページリンク",
  issueKey: "課題キー",
};

const TABLE = "| 項目 | 内容 |\n| --- | --- |\n|  |  |\n";

/** Expands the selection to whole lines and prefixes each one. */
function prefixLines(sel: Selection, prefix: (lineIndex: number) => string): Selection {
  const { text } = sel;
  const from = text.lastIndexOf("\n", sel.start - 1) + 1;
  const toBreak = text.indexOf("\n", sel.end);
  const to = toBreak === -1 ? text.length : toBreak;
  const lines = text.slice(from, to).split("\n");
  const block = lines.map((l, i) => prefix(i) + l).join("\n");
  return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length };
}

/** Wraps the selection, or inserts a placeholder and selects it. */
function wrap(sel: Selection, before: string, after: string, placeholder: string): Selection {
  const inner = sel.start === sel.end ? placeholder : sel.text.slice(sel.start, sel.end);
  const text = sel.text.slice(0, sel.start) + before + inner + after + sel.text.slice(sel.end);
  return { text, start: sel.start + before.length, end: sel.start + before.length + inner.length };
}

/** Inserts a block on its own line at the selection and puts the cursor after it. */
export function insertBlock(sel: Selection, block: string): Selection {
  const head = sel.text.slice(0, sel.start);
  const lead = head === "" || head.endsWith("\n") ? "" : "\n";
  const text = head + lead + block + sel.text.slice(sel.end);
  const pos = head.length + lead.length + block.length;
  return { text, start: pos, end: pos };
}

/** `issuePrefix` is the current fiscal year's "YY-", inserted by the 課題キー command. */
export function applyCommand(cmd: ToolbarCommand, sel: Selection, issuePrefix = ""): Selection {
  switch (cmd) {
    case "heading":
      return prefixLines(sel, () => "## ");
    case "ul":
      return prefixLines(sel, () => "- ");
    case "ol":
      return prefixLines(sel, (i) => `${i + 1}. `);
    case "check":
      return prefixLines(sel, () => "- [ ] ");
    case "bold":
      return wrap(sel, "**", "**", "太字");
    case "code":
      return sel.text.slice(sel.start, sel.end).includes("\n") ? wrap(sel, "```\n", "\n```", "") : wrap(sel, "`", "`", "コード");
    case "link": {
      const label = sel.start === sel.end ? "リンク" : sel.text.slice(sel.start, sel.end);
      const text = sel.text.slice(0, sel.start) + `[${label}](url)` + sel.text.slice(sel.end);
      const urlStart = sel.start + label.length + 3;
      return { text, start: urlStart, end: urlStart + 3 };
    }
    case "table":
      return insertBlock(sel, TABLE);
    case "wikiLink":
      return wrap(sel, "[[", "]]", "ページ名");
    case "issueKey": {
      const text = sel.text.slice(0, sel.start) + issuePrefix + sel.text.slice(sel.end);
      const pos = sel.start + issuePrefix.length;
      return { text, start: pos, end: pos };
    }
  }
}
