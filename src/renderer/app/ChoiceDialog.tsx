import { useCallback, useEffect, useRef, useState } from "react";
import type { ParentAnswer } from "../issues/parentOps";

interface Props {
  message: string;
  allLabel: string;
  onAnswer(answer: ParentAnswer): void;
}

/** Modal question with three buttons; Escape answers キャンセル. */
export function ChoiceDialog({ message, allLabel, onAnswer }: Props): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const answered = useRef(false);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    dlg.showModal();
    first.current?.focus();
    // Escape fires "cancel" then "close" natively; a button press already set `answered`.
    const onNativeClose = (): void => {
      if (!answered.current) {
        answered.current = true;
        onAnswer("cancel");
      }
    };
    dlg.addEventListener("close", onNativeClose);
    return () => dlg.removeEventListener("close", onNativeClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = (a: ParentAnswer): void => {
    if (answered.current) return;
    answered.current = true;
    onAnswer(a);
    ref.current?.close();
  };

  return (
    <dialog ref={ref} className="choice-dialog" aria-label={message}>
      <p className="choice-dialog__message">{message}</p>
      <div className="form-actions">
        <button ref={first} type="button" className="button--primary" onClick={() => answer("all")}>
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
  const [open, setOpen] = useState<{ message: string; allLabel: string; resolve(a: ParentAnswer): void } | null>(null);
  const ask = useCallback(
    (message: string, allLabel: string): Promise<ParentAnswer> => new Promise((resolve) => setOpen({ message, allLabel, resolve })),
    [],
  );
  const dialog =
    open === null ? null : (
      <ChoiceDialog
        key={open.message}
        message={open.message}
        allLabel={open.allLabel}
        onAnswer={(a) => {
          setOpen(null);
          open.resolve(a);
        }}
      />
    );
  return { ask, dialog };
}
