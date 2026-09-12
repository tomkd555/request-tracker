import { useEffect, useState } from "react";

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
};

export function SelectField<T extends string>({ value, options, onSave, className }: SelectProps<T>): React.JSX.Element {
  return (
    <select className={className} value={value} onChange={(e) => onSave(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DateField({ value, onSave }: { value: string | null; onSave(v: string | null): void }): React.JSX.Element {
  return <input type="date" value={value ?? ""} onChange={(e) => onSave(e.target.value || null)} />;
}

type TextAreaProps = { value: string; onSave(v: string): void; preview(v: string): React.ReactNode };

/** Markdown editor with 編集 / プレビュー tabs; 保存 writes, キャンセル restores. */
export function MarkdownField({ value, onSave, preview }: TextAreaProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (!editing) {
    return (
      <div>
        <div className="markdown-view">{value.trim() === "" ? <span className="muted">（なし）</span> : preview(value)}</div>
        <button type="button" onClick={() => setEditing(true)}>
          編集
        </button>
      </div>
    );
  }
  return (
    <div className="markdown-editor">
      <div className="tabs">
        <button type="button" className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>
          編集
        </button>
        <button type="button" className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>
          プレビュー
        </button>
      </div>
      {tab === "edit" ? (
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} autoFocus />
      ) : (
        <div className="markdown-view">{preview(draft)}</div>
      )}
      <div className="form-actions">
        <button
          type="button"
          onClick={() => {
            if (draft !== value) onSave(draft);
            setEditing(false);
          }}
        >
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
    </div>
  );
}
