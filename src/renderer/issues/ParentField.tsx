import { useEffect, useId, useState } from "react";
import type { Issue } from "../../shared/types";
import { M } from "../messages";

const optionText = (i: Issue): string => `${i.key} ${i.summary}`;

/** The key typed or picked in a parent field: the first token of the text, when it names one of `candidates`. */
export function resolveParent(text: string, candidates: Issue[]): { key: string | null; invalid: boolean } {
  const t = text.trim();
  if (t === "") return { key: null, invalid: false };
  const key = t.split(/\s+/)[0];
  return candidates.some((i) => i.key === key) ? { key, invalid: false } : { key: null, invalid: true };
}

/** The text a field that saves on blur shows once `text` is committed: an invalid text goes back to `restored`, with the reason. */
export function settleParentText(text: string, candidates: Issue[], restored: string): { text: string; message: string | null } {
  if (text === restored) return { text, message: null };
  return resolveParent(text, candidates).invalid ? { text: restored, message: M.parentNotFound } : { text, message: null };
}

/** True when the owner cleared the key because `text` names no candidate: the field keeps the text the user is typing. */
export function keepsTypedText(value: string | null, text: string, candidates: Issue[]): boolean {
  return value === null && resolveParent(text, candidates).invalid;
}

type Props = {
  value: string | null;
  /** The issues the owner allows; for a parent it excludes the issue itself, everything under it, and any level too deep (see parentRefusal). */
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
  const currentIssue = candidates.find((i) => i.key === value);
  const committedText = currentIssue ? optionText(currentIssue) : (value ?? "");
  const [text, setText] = useState(committedText);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (keepsTypedText(value, text, candidates)) return;
    setText(committedText);
  }, [committedText]);

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
          setMessage(null);
          if (commitOn === "change") {
            const r = resolveParent(e.target.value, candidates);
            onChange(r.key, r.invalid);
          }
        }}
        onBlur={() => {
          if (commitOn !== "blur") return;
          const settled = settleParentText(text, candidates, committedText);
          setText(settled.text);
          setMessage(settled.message);
          if (text === committedText) return;
          const r = resolveParent(text, candidates);
          onChange(r.key, r.invalid);
        }}
        onKeyDown={(e) => {
          if (commitOn === "blur" && e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(committedText);
            setMessage(null);
          }
        }}
      />
      {message !== null && <span className="text--error">{message}</span>}
      <datalist id={listId}>
        {candidates.map((i) => (
          <option key={i.key} value={optionText(i)} />
        ))}
      </datalist>
    </>
  );
}
