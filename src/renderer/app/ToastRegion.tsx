import { useEffect } from "react";
import { clearToast, useToast } from "./toast";
import { useSession } from "./UserContext";

/** The CSS animation times the toast; this is the ceiling in case it never ends (animations disabled, or paused mid-exit). */
const FALLBACK_MS = 15000;

/** The status region is always in the DOM, so screen readers announce a message inserted into it. */
export function ToastRegion(): React.JSX.Element {
  const { config } = useSession();
  const toast = useToast();
  const id = config.notice === "off" ? undefined : toast?.id;
  useEffect(() => {
    if (id === undefined) return;
    // The first click or key press after the message appeared removes it at once; the submit that raised it happened before.
    const dismiss = (): void => clearToast(id);
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    const timer = window.setTimeout(dismiss, FALLBACK_MS);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
      window.clearTimeout(timer);
    };
  }, [id]);
  return (
    <div className="toast-region" role="status">
      {id !== undefined && toast && (
        <p key={id} className="toast" onAnimationEnd={() => clearToast(id)}>
          {toast.message}
        </p>
      )}
    </div>
  );
}
