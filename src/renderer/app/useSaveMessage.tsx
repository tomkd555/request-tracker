import { useState } from "react";
import { errorMessage, M } from "../messages";

/** The result line under a form: a status such as the saved message, or an error. */
export interface FormMessage { text: string; isError: boolean }

/** Runs a save and keeps its result line: the saved message, or the store's error. Shared by the settings screens. */
export function useSaveMessage(): [FormMessage | null, (action: () => Promise<void>) => Promise<void>] {
  const [message, setMessage] = useState<FormMessage | null>(null);
  const run = async (action: () => Promise<void>): Promise<void> => {
    setMessage(null);
    try {
      await action();
      setMessage({ text: M.saved, isError: false });
    } catch (e) {
      setMessage({ text: errorMessage(e), isError: true });
    }
  };
  return [message, run];
}

/** The result line itself: an error is announced as an alert, a status is shown muted. */
export function FormMessageLine({ message }: { message: FormMessage | null }): React.JSX.Element | null {
  if (message === null) return null;
  return message.isError ? (
    <p className="text--error" role="alert">
      {message.text}
    </p>
  ) : (
    <p className="text--muted">{message.text}</p>
  );
}
