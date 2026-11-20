import { useEffect, useRef, useState } from "react";
import { applyCommand, insertBlock, TOOLBAR_LABEL, type TextSelection, type ToolbarCommand } from "../app/markdownToolbar";
import { useNavigationGuard } from "../app/useHashRoute";
import { formatHours, parseHours } from "./hours";

type TextProps = { value: string; onSave(v: string): void; className?: string; required?: boolean; ariaLabel?: string };

/** Text field that saves on blur or Enter; Escape restores the saved value. */
export function TextField({ value, onSave, className, required, ariaLabel }: TextProps): React.JSX.Element {
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
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur(); // onBlur commits; a commit here as well would save twice
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

/**
 * Date field. A date picked in the calendar saves at once. A date typed on the keyboard saves on blur or Enter:
 * each digit typed into the year is a complete date of its own ("0002-10-01"), and a segment being retyped reads as no date.
 * Escape restores the saved value.
 */
export function DateField({ value, onSave, className, ariaLabel }: DateProps): React.JSX.Element {
  const saved = value ?? "";
  const [draft, setDraft] = useState(saved);
  const isTyping = useRef(false);
  useEffect(() => setDraft(saved), [saved]);
  /** Shows the saved date again; the input is reset directly as well, since a half-typed date has the same value ("") as a saved empty one and React would leave its segments on screen. */
  const restore = (input: HTMLInputElement): void => {
    isTyping.current = false;
    input.value = saved;
    setDraft(saved);
  };
  const commit = (input: HTMLInputElement): void => {
    const next = input.validity.badInput ? saved : input.value; // a date left half-typed goes back to the saved one; an emptied field clears the date
    restore(input); // the saved date shows until the save lands, and stays when the save is refused
    if (next !== saved) onSave(next || null);
  };
  return (
    <input
      type="date"
      className={className}
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => (isTyping.current ? setDraft(e.target.value) : commit(e.target))}
      onBlur={(e) => commit(e.target)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget);
        else if (e.key === "Escape") restore(e.currentTarget);
        // The keys that edit a segment; Alt+↓, which opens the calendar, is none of them.
        else if (!e.altKey && (/^\d$/.test(e.key) || ["Backspace", "Delete", "ArrowUp", "ArrowDown"].includes(e.key))) isTyping.current = true;
      }}
    />
  );
}

type HoursProps = { value: number | null | undefined; onSave(v: number | null): void; onRefuse(): void; className?: string; ariaLabel?: string };

/** 予定時間 or 実績時間: saves on blur or Enter; text parseHours refuses is dropped and reported through onRefuse. */
export function HoursField({ value, onSave, onRefuse, className, ariaLabel }: HoursProps): React.JSX.Element {
  const saved = formatHours(value);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const commit = (): void => {
    const parsed = parseHours(draft);
    if (!parsed.ok) {
      setDraft(saved);
      onRefuse();
      return;
    }
    if (parsed.value === (value ?? null)) setDraft(saved);
    else onSave(parsed.value);
  };
  return (
    <input
      className={className}
      aria-label={ariaLabel}
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(saved);
      }}
    />
  );
}

const BASE_COMMANDS: ToolbarCommand[] = ["heading", "bold", "ul", "ol", "check", "code", "link", "table"];

/** Textarea rows of an issue's 詳細, on the detail screen and the create form. */
export const DESCRIPTION_ROWS = 12;

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
  onClick(sel: TextSelection, insert: (block: string) => void): void;
}

/** Markdown textarea with a toolbar and 編集 / プレビュー tabs. Controlled; the owner decides when to save. */
export function MarkdownEditor({ value, onChange, preview, rows, autoFocus, extraCommands = [], issuePrefix = "", ariaLabel, tools = [] }: EditorProps): React.JSX.Element {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  // The selection a command produced is applied after React has written the new value.
  useEffect(() => {
    if (pendingSelection.current && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pendingSelection.current.start, pendingSelection.current.end);
      pendingSelection.current = null;
    }
  }, [value]);

  const runCommand = (cmd: ToolbarCommand): void => {
    const el = textareaRef.current;
    if (!el) return;
    const next = applyCommand(cmd, { text: value, start: el.selectionStart, end: el.selectionEnd }, issuePrefix);
    pendingSelection.current = { start: next.start, end: next.end };
    onChange(next.text);
  };

  const runTool = (t: EditorTool): void => {
    const el = textareaRef.current;
    if (!el) return;
    const sel: TextSelection = { text: value, start: el.selectionStart, end: el.selectionEnd };
    t.onClick(sel, (block) => {
      const next = insertBlock(sel, block.endsWith("\n") ? block : `${block}\n`);
      pendingSelection.current = { start: next.start, end: next.end };
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
              <button key={c} type="button" className="markdown-editor__tool" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand(c)}>
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
          ref={textareaRef}
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

/** `onSave` resolves false when the write failed; the editor then stays open with the draft. */
type MarkdownFieldProps = { title: string; value: string; onSave(v: string): Promise<boolean>; preview(v: string): React.ReactNode };

/** A titled section showing rendered Markdown, with 編集 at the section head; 保存 writes, キャンセル restores. */
export function MarkdownField({ title, value, onSave, preview }: MarkdownFieldProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useNavigationGuard(editing && draft !== value);

  const save = async (): Promise<void> => {
    if (saving) return;
    if (draft !== value) {
      setSaving(true);
      const saved = await onSave(draft);
      setSaving(false);
      if (!saved) return;
    }
    setEditing(false);
  };

  return (
    <section
      onKeyDown={(e) => {
        if (editing && (e.ctrlKey || e.metaKey) && e.key === "Enter") void save();
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
          <MarkdownEditor value={draft} onChange={setDraft} preview={preview} rows={DESCRIPTION_ROWS} autoFocus ariaLabel={title} />
          <div className="form-actions">
            <button type="button" className="button--primary" disabled={saving} onClick={() => void save()}>
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
