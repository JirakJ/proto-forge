import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { tokens } from "../tokens";
import { Portal } from "./Portal";

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

// Transient notifications in a polite/assertive live region. Error toasts use
// role=alert (assertive); info toasts role=status (polite). Auto-dismiss after
// `duration`. The region portals to the body-level overlay root at
// tokens.layer.toast — the top of the scale, so a toast raised from inside a
// modal is still announced and visible.
export function ToastProvider({ children, label, duration = 4000 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const seq = useRef(0);

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

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <Portal>
        <div
          role="region"
          aria-label={label}
          data-testid="toast-region"
          style={{
            position: "fixed",
            zIndex: tokens.layer.toast,
            insetBlockEnd: tokens.space.md,
            insetInlineEnd: tokens.space.md,
            display: "flex",
            flexDirection: "column",
            gap: tokens.space.sm,
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              data-testid={`toast-${t.id}`}
              style={{
                background: t.tone === "error" ? tokens.color.danger : tokens.color.fg,
                color: tokens.color.primaryFg,
                padding: tokens.space.sm,
                borderRadius: tokens.radius.sm,
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}
