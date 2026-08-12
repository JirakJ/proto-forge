import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { tokens } from "../tokens";
import { Portal } from "./Portal";
import { useOverlaySlot, usePromotion } from "./overlay/index";

type Tone = "info" | "error";
type ToastEntry = { id: string; message: string; tone: Tone };
type ToastApi = { notify: (message: string, tone?: Tone) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx;
}

export type ToastProviderProps = {
  children: ReactNode;
  /**
   * Accessible name of the notification region. Required and already translated
   * by the caller: the library owns no user-visible copy of its own (BR-08).
   */
  label: string;
  duration?: number;
};

// The per-toast row, outside the provider so its lines are behaviour (NFR-20). Error
// toasts use role=alert (assertive); info toasts role=status (polite).
function ToastEntryView({ toast }: { toast: ToastEntry }) {
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      data-testid={`toast-${toast.id}`}
      style={{
        background: toast.tone === "error" ? tokens.color.danger : tokens.color.fg,
        color: tokens.color.primaryFg,
        padding: tokens.space.sm,
        borderRadius: tokens.radius.sm,
      }}
    >
      {toast.message}
    </div>
  );
}

// @adr 008 - a toast is above whatever was open when it was raised
//
// The region is promoted into the top layer when it has something to show, and demoted
// when it empties. Promoting PER BATCH rather than once at mount is what makes the
// guarantee hold: order in the top layer is promotion order, so a region promoted at
// application start would sit under a modal opened later — and a toast that a modal
// hides is a toast that may be the reason the modal should close.
//
// Not dismissible by Escape or an outside pointer, so it claims no slot in the dismissal
// chain: a stray click while a toast is up must not swallow the keystroke a dialog wants.
export function ToastProvider({ children, label, duration = 4000 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const regionRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const showing = toasts.length > 0;
  const slot = useOverlaySlot("toast", showing);
  const { capabilities } = slot;

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: Tone = "info") => {
      const id = `t${(seq.current += 1)}`;
      setToasts((current) => [...current, { id, message, tone }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss, duration],
  );

  usePromotion(regionRef, showing, capabilities);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <Portal>
        <div
          ref={regionRef}
          role="region"
          aria-label={label}
          data-testid="toast-region"
          style={{
            position: "fixed",
            zIndex: slot.fallbackZIndex,
            insetBlockEnd: tokens.space.md,
            insetInlineEnd: tokens.space.md,
            display: "flex",
            flexDirection: "column",
            gap: tokens.space.sm,
          }}
        >
          {toasts.map((t) => (
            <ToastEntryView key={t.id} toast={t} />
          ))}
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}
