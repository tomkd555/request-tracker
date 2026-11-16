import { useCallback, useEffect, useRef, useState } from "react";
import type { ParentAnswer } from "../issues/parentOps";

interface Props {
  message: string;
  allLabel: string;
  onAnswer(answer: ParentAnswer): void;
}

/** Modal question with three buttons; Escape answers キャンセル. */
function ChoiceDialog({ message, allLabel, onAnswer }: Props): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const allButtonRef = useRef<HTMLButtonElement>(null);
  const isAnswered = useRef(false);

  // Runs once per mount: useChoiceDialog remounts the dialog for each question (key={message}), so `onAnswer` is this question's.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    allButtonRef.current?.focus();
    // Escape fires "cancel" then "close" natively; a button press already set `isAnswered`.
    const onNativeClose = (): void => {
      if (!isAnswered.current) {
        isAnswered.current = true;
        onAnswer("cancel");
      }
    };
    dialog.addEventListener("close", onNativeClose);
    return () => dialog.removeEventListener("close", onNativeClose);
  }, []);

  const answer = (a: ParentAnswer): void => {
    if (isAnswered.current) return;
    isAnswered.current = true;
    onAnswer(a);
    dialogRef.current?.close();
  };

  return (
    <dialog ref={dialogRef} className="choice-dialog" aria-label={message}>
      <p className="choice-dialog__message">{message}</p>
      <div className="form-actions">
        <button ref={allButtonRef} type="button" className="button--primary" onClick={() => answer("all")}>
          {allLabel}
        </button>
        <button type="button" onClick={() => answer("only")}>
          この課題だけ
        </button>
        <button type="button" onClick={() => answer("cancel")}>
          キャンセル
        </button>
      </div>
    </dialog>
  );
}

/** `ask` opens the dialog and resolves with the answer; render `dialog` once in the screen. */
export function useChoiceDialog(): { ask(message: string, allLabel: string): Promise<ParentAnswer>; dialog: React.JSX.Element | null } {
  const [pendingQuestion, setPendingQuestion] = useState<{ message: string; allLabel: string; resolve(a: ParentAnswer): void } | null>(null);
  const ask = useCallback(
    (message: string, allLabel: string): Promise<ParentAnswer> => new Promise((resolve) => setPendingQuestion({ message, allLabel, resolve })),
    [],
  );
  const dialog =
    pendingQuestion === null ? null : (
      <ChoiceDialog
        key={pendingQuestion.message}
        message={pendingQuestion.message}
        allLabel={pendingQuestion.allLabel}
        onAnswer={(a) => {
          setPendingQuestion(null);
          pendingQuestion.resolve(a);
        }}
      />
    );
  return { ask, dialog };
}
