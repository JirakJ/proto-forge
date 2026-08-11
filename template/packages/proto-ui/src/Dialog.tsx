import { useEffect, useRef, type ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { tokens } from "../tokens";
import { useProviderKind } from "../providers/index";
import { Portal } from "./Portal";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Already translated by the caller — never a literal (BR-08). */
  title: string;
  children: ReactNode;
  "data-testid": string;
};

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Provider switch (BR-11): "own" renders an accessible modal; "radix" sits on
// @radix-ui/react-dialog. Same API, same tests pass under both — including the
// layering contract, which is why both portal to the body-level overlay root.
export function Dialog(props: DialogProps) {
  return useProviderKind() === "radix" ? <RadixDialogImpl {...props} /> : <OwnDialogImpl {...props} />;
}

function OwnDialogImpl({ open, onClose, title, children, "data-testid": testid }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  // onClose is read through a ref so the effect below can key on [open] ONLY.
  // Keying on onClose would tear down + re-run the effect on every parent
  // re-render that passes a fresh inline onClose, stealing focus mid-interaction.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    node.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      /* v8 ignore next -- jsdom activeElement is never null; restore runs in a real browser */
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <Portal>
      <div
        data-testid={`${testid}-scrim`}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: tokens.layer.overlay,
          background: tokens.color.scrim,
          display: "grid",
          placeItems: "center",
        }}
        onClick={onClose}
      >
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          data-testid={testid}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            zIndex: tokens.layer.modal,
            background: tokens.color.bg,
            color: tokens.color.fg,
            padding: tokens.space.lg,
            borderRadius: tokens.radius.md,
            minWidth: "280px",
          }}
        >
          <h2 data-testid={`${testid}-title`} style={{ fontSize: tokens.font.sizeLg, marginBlockStart: 0 }}>
            {title}
          </h2>
          {children}
        </div>
      </div>
    </Portal>
  );
}

function RadixDialogImpl({ open, onClose, title, children, "data-testid": testid }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={() => onClose() /* controlled: only ever signals close */}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          data-testid={`${testid}-scrim`}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: tokens.layer.overlay,
            background: tokens.color.scrim,
          }}
        />
        <RadixDialog.Content
          data-testid={testid}
          aria-describedby={undefined}
          style={{
            position: "fixed",
            zIndex: tokens.layer.modal,
            insetBlockStart: "50%",
            insetInlineStart: "50%",
            transform: "translate(-50%, -50%)",
            background: tokens.color.bg,
            color: tokens.color.fg,
            padding: tokens.space.lg,
            borderRadius: tokens.radius.md,
            minWidth: "280px",
          }}
        >
          <RadixDialog.Title
            data-testid={`${testid}-title`}
            style={{ fontSize: tokens.font.sizeLg, marginBlockStart: 0 }}
          >
            {title}
          </RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
