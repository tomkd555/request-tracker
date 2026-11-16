import { useEffect } from "react";
import { clearToast, dropToastWhenOff, useToast } from "./toast";
import { useSession } from "./SessionContext";

/** The CSS animation times the toast; this is the ceiling in case it never ends (animations disabled, or paused mid-exit). */
const FALLBACK_MS = 15000;

/** The status region is always in the DOM, so screen readers announce a message inserted into it. */
export function ToastRegion(): React.JSX.Element {
  const { config } = useSession();
  const toast = useToast();
  const shownToast = config.notice === "off" ? null : toast;
  const shownId = shownToast?.id;
  useEffect(() => dropToastWhenOff(config.notice), [config.notice, toast]);
  useEffect(() => {
    if (shownId === undefined) return;
    // The first click or key press after the message appeared removes it at once; the submit that raised it happened before.
    const dismiss = (): void => clearToast(shownId);
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    const timer = window.setTimeout(dismiss, FALLBACK_MS);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
      window.clearTimeout(timer);
    };
  }, [shownId]);
  return (
    <div className="toast-region" role="status">
      {shownToast && (
        <p key={shownToast.id} className="toast" onAnimationEnd={() => clearToast(shownToast.id)}>
          {shownToast.message}
        </p>
      )}
    </div>
  );
}
