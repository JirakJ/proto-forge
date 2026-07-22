import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { tokens } from "../tokens";

type Tone = "info" | "error";
type ToastEntry = { id: string; message: string; tone: Tone };
type ToastApi = { notify: (message: string, tone?: Tone) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx;
}

export type ToastProviderProps = { children: ReactNode; duration?: number };

// Transient notifications in a polite/assertive live region. Error toasts use
// role=alert (assertive); info toasts role=status (polite). Auto-dismiss after `duration`.
export function ToastProvider({ children, duration = 4000 }: ToastProviderProps) {
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
      <div
        role="region"
        aria-label="Notifications"
        style={{
          position: "fixed",
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
            data-testid="toast"
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
    </ToastContext.Provider>
  );
}
