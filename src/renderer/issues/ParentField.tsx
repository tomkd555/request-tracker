import { useEffect, useId, useState } from "react";
import type { Issue } from "../../shared/types";

const optionText = (i: Issue): string => `${i.key} ${i.summary}`;

/** The key typed or picked in a parent field: the first token of the text, when it names one of `candidates`. */
export function resolveParent(text: string, candidates: Issue[]): { key: string | null; invalid: boolean } {
  const t = text.trim();
  if (t === "") return { key: null, invalid: false };
  const key = t.split(/\s+/)[0];
  return candidates.some((i) => i.key === key) ? { key, invalid: false } : { key: null, invalid: true };
}

type Props = {
  value: string | null;
  /** Top-level issues that may become the parent; the owner excludes the issue itself. */
  candidates: Issue[];
  onChange(key: string | null, invalid: boolean): void;
  /** "change": report every keystroke (a form that validates on submit); "blur": report on blur or Enter (a field that saves at once). */
  commitOn: "change" | "blur";
  className?: string;
  ariaLabel?: string;
};

/** Text input with a datalist of `KEY 件名`; typing a key or part of a summary narrows the list. */
export function ParentField({ value, candidates, onChange, commitOn, className, ariaLabel }: Props): React.JSX.Element {
  const listId = useId();
  const current = candidates.find((i) => i.key === value);
  const [text, setText] = useState(current ? optionText(current) : (value ?? ""));
  useEffect(() => {
    setText(current ? optionText(current) : (value ?? ""));
  }, [value, current]);

  return (
    <>
      <input
        className={className}
        aria-label={ariaLabel}
        list={listId}
        value={text}
        placeholder="キーまたは件名"
        onChange={(e) => {
          setText(e.target.value);
          if (commitOn === "change") {
            const r = resolveParent(e.target.value, candidates);
            onChange(r.key, r.invalid);
          }
        }}
        onBlur={() => {
          if (commitOn !== "blur") return;
          const r = resolveParent(text, candidates);
          onChange(r.key, r.invalid);
        }}
        onKeyDown={(e) => {
          if (commitOn === "blur" && e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setText(current ? optionText(current) : (value ?? ""));
        }}
      />
      <datalist id={listId}>
        {candidates.map((i) => (
          <option key={i.key} value={optionText(i)} />
        ))}
      </datalist>
    </>
  );
}
