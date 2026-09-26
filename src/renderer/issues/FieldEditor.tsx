import { useEffect, useRef, useState } from "react";
import { applyCommand, insertBlock, TOOLBAR_LABEL, type Selection, type ToolbarCommand } from "../app/markdownToolbar";
import { useNavigationGuard } from "../app/useHashRoute";

type TextProps = { value: string; onSave(v: string): void; className?: string; required?: boolean };

/** Text field that saves on blur or Enter; Escape restores the saved value. */
export function TextField({ value, onSave, className, required }: TextProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (): void => {
    const v = draft.trim();
    if (v === value) return;
    if (required && v === "") {
      setDraft(value);
      return;
    }
    onSave(v);
  };
  return (
    <input
      className={className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

type SelectProps<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onSave(v: T): void;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
};

export function SelectField<T extends string>({ value, options, onSave, className, style, ariaLabel }: SelectProps<T>): React.JSX.Element {
  return (
    <select className={className} style={style} aria-label={ariaLabel} value={value} onChange={(e) => onSave(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

type DateProps = { value: string | null; onSave(v: string | null): void; className?: string; ariaLabel?: string };

export function DateField({ value, onSave, className, ariaLabel }: DateProps): React.JSX.Element {
  return (
    <input
      type="date"
      className={className}
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => onSave(e.target.value || null)}
    />
  );
}

const BASE_COMMANDS: ToolbarCommand[] = ["heading", "bold", "ul", "ol", "check", "code", "link", "table"];

type EditorProps = {
  value: string;
  onChange(v: string): void;
  preview(v: string): React.ReactNode;
  rows: number;
  autoFocus?: boolean;
  /** Toolbar buttons added after the base set (the wiki adds ページリンク and 課題キー). */
  extraCommands?: ToolbarCommand[];
  /** The current fiscal year's "YY-", for the 課題キー command. */
  issuePrefix?: string;
  ariaLabel?: string;
  /** Buttons after the commands; each receives the textarea's selection and an `insert` that puts a block at it (the reports add their blocks this way). */
  tools?: EditorTool[];
};

export interface EditorTool {
  label: string;
  onClick(sel: Selection, insert: (block: string) => void): void;
}

/** Markdown textarea with a toolbar and 編集 / プレビュー tabs. Controlled; the owner decides when to save. */
export function MarkdownEditor({ value, onChange, preview, rows, autoFocus, extraCommands = [], issuePrefix = "", ariaLabel, tools = [] }: EditorProps): React.JSX.Element {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const area = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ start: number; end: number } | null>(null);

  // The selection a command produced is applied after React has written the new value.
  useEffect(() => {
    if (pending.current && area.current) {
      area.current.focus();
      area.current.setSelectionRange(pending.current.start, pending.current.end);
      pending.current = null;
    }
  }, [value]);

  const run = (cmd: ToolbarCommand): void => {
    const el = area.current;
    if (!el) return;
    const next = applyCommand(cmd, { text: value, start: el.selectionStart, end: el.selectionEnd }, issuePrefix);
    pending.current = { start: next.start, end: next.end };
    onChange(next.text);
  };

  const runTool = (t: EditorTool): void => {
    const el = area.current;
    if (!el) return;
    const sel: Selection = { text: value, start: el.selectionStart, end: el.selectionEnd };
    t.onClick(sel, (block) => {
      const next = insertBlock(sel, block.endsWith("\n") ? block : `${block}\n`);
      pending.current = { start: next.start, end: next.end };
      onChange(next.text);
    });
  };

  return (
    <div className="markdown-editor">
      <div className="markdown-editor__bar">
        <div className="markdown-editor__tabs">
          <button type="button" className={tab === "edit" ? "markdown-editor__tab--active" : ""} onClick={() => setTab("edit")}>
            編集
          </button>
          <button type="button" className={tab === "preview" ? "markdown-editor__tab--active" : ""} onClick={() => setTab("preview")}>
            プレビュー
          </button>
        </div>
        {tab === "edit" && (
          <div className="markdown-editor__tools" role="toolbar" aria-label="書式">
            {[...BASE_COMMANDS, ...extraCommands].map((c) => (
              <button key={c} type="button" className="markdown-editor__tool" onMouseDown={(e) => e.preventDefault()} onClick={() => run(c)}>
                {TOOLBAR_LABEL[c]}
              </button>
            ))}
            {tools.map((t) => (
              <button key={t.label} type="button" className="markdown-editor__tool markdown-editor__tool--block" onMouseDown={(e) => e.preventDefault()} onClick={() => runTool(t)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {tab === "edit" ? (
        <textarea
          ref={area}
          className="markdown-editor__textarea"
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          autoFocus={autoFocus}
        />
      ) : (
        <div className="markdown-view markdown-view--preview">{value.trim() === "" ? <span className="text--muted">（なし）</span> : preview(value)}</div>
      )}
    </div>
  );
}

type FieldProps = { title: string; value: string; onSave(v: string): void; preview(v: string): React.ReactNode };

/** A titled section showing rendered Markdown, with 編集 at the section head; 保存 writes, キャンセル restores. */
export function MarkdownField({ title, value, onSave, preview }: FieldProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useNavigationGuard(editing && draft !== value);

  const save = (): void => {
    if (draft !== value) onSave(draft);
    setEditing(false);
  };

  return (
    <section
      onKeyDown={(e) => {
        if (editing && (e.ctrlKey || e.metaKey) && e.key === "Enter") save();
      }}
    >
      <div className="section-head">
        <h2>{title}</h2>
        {!editing && (
          <button type="button" className="button--quiet" onClick={() => setEditing(true)}>
            編集
          </button>
        )}
      </div>
      {editing ? (
        <>
          <MarkdownEditor value={draft} onChange={setDraft} preview={preview} rows={12} autoFocus ariaLabel={title} />
          <div className="form-actions">
            <button type="button" className="button--primary" onClick={save}>
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
            >
              キャンセル
            </button>
          </div>
        </>
      ) : (
        <div className="markdown-view">{value.trim() === "" ? <span className="text--muted">（なし）</span> : preview(value)}</div>
      )}
    </section>
  );
}
