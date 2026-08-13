import { useState, type ReactNode } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  Menu,
  Select,
  Table,
  Tabs,
  ToastProvider,
  Tooltip,
  tokens,
  useToast,
} from "@jj/proto-ui";

// @adr 009 - the JSX half of the registry, keyed by the same ids as cases.ts
//
// Strings here are deliberately literal. This is a fixture catalogue, not UI — the i18n
// rules are switched off for src/harness/** for exactly that reason, and nothing in here
// is reachable from the application. It is only in the bundle when VITE_HARNESS=1.
//
// Testids are namespaced `harness-` so a case's own markup can never collide with the
// application's, and overlay:matrix checks that every id here has a case and vice versa.

type Person = { id: string; name: string; role: string };

const rows: Person[] = [
  { id: "1", name: "Ada Lovelace", role: "Author" },
  { id: "2", name: "Grace Hopper", role: "Compiler" },
];
const noRows: Person[] = [];

function ToastDemo() {
  const { notify } = useToast();
  return (
    <Button data-testid="harness-toast-fire" onClick={() => notify("Note saved")}>
      Fire a toast
    </Button>
  );
}

function DialogDemo({ withMenu }: { withMenu: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Delete note" data-testid="harness-dialog">
      <p>This cannot be undone.</p>
      {withMenu ? (
        <Menu
          label="More actions"
          data-testid="harness-dialog-menu"
          items={[
            { id: "archive", label: "Archive instead", onSelect: () => {} },
            { id: "export", label: "Export first", onSelect: () => {} },
          ]}
        />
      ) : null}
      <Button data-testid="harness-dialog-confirm" variant="danger" onClick={() => setOpen(false)}>
        Delete
      </Button>
    </Dialog>
  );
}

// The adversarial case. An ancestor with `transform` creates a stacking context no
// descendant z-index can escape, and `overflow: hidden` clips whatever is left — together
// the single most common reason a modal "disappears". A surface in the top layer is
// affected by neither, and e2e/overlay-layering.e2e.ts asserts that against real paint.
function StackingTrapDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div
        data-testid="harness-trap-header"
        style={{
          position: "sticky",
          insetBlockStart: 0,
          zIndex: tokens.layer.sticky,
          background: tokens.color.primary,
          color: tokens.color.primaryFg,
          padding: tokens.space.sm,
        }}
      >
        Sticky header at tokens.layer.sticky
      </div>
      <div
        data-testid="harness-trap"
        style={{
          transform: "translateZ(0)",
          filter: "blur(0px)",
          overflow: "hidden",
          blockSize: "80px",
          border: `1px solid ${tokens.color.border}`,
          marginBlockStart: tokens.space.md,
        }}
      >
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Not trapped"
          data-testid="harness-trapped-dialog"
        >
          <p>Rendered from inside a transformed, clipped 80px box.</p>
        </Dialog>
      </div>
    </div>
  );
}

function ToastOverModalDemo() {
  const [open, setOpen] = useState(true);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Saving" data-testid="harness-toast-dialog">
      <ToastDemo />
    </Dialog>
  );
}

// A sibling holding the largest z-index CSS accepts. Any scale-based overlay loses to
// this by definition; a top-layer surface does not compete with it at all.
function HostileZIndexDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div
        data-testid="harness-hostile-sibling"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483647,
          background: "rgba(200, 30, 30, 0.35)",
          display: "grid",
          placeItems: "end center",
        }}
      >
        <p style={{ color: tokens.color.fg, background: tokens.color.bg, padding: tokens.space.sm }}>
          Hostile app-code layer at z-index 2147483647
        </p>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Still on top" data-testid="harness-hostile-dialog">
        <p>The hostile sibling holds the largest z-index CSS accepts.</p>
      </Dialog>
    </div>
  );
}

// One fixture, three layering questions: dialog B above dialog A, Escape closing only
// the topmost, and the scroll lock and focus surviving the stack unwinding.
function DialogOverDialogDemo() {
  const [aOpen, setAOpen] = useState(true);
  const [bOpen, setBOpen] = useState(false);
  return (
    <>
      <Dialog open={aOpen} onClose={() => setAOpen(false)} title="First" data-testid="harness-dialog-a">
        <p>The first dialog.</p>
        <Button data-testid="harness-open-b" onClick={() => setBOpen(true)}>
          Open the second
        </Button>
      </Dialog>
      <Dialog open={bOpen} onClose={() => setBOpen(false)} title="Second" data-testid="harness-dialog-b">
        <p data-testid="harness-dialog-b-body">The second dialog, above the first.</p>
      </Dialog>
    </>
  );
}

// The case a per-kind scale cannot express: the menu belongs to dialog A, so a dialog B
// opened LATER must paint above the menu — popover-above-modal must not be global.
function MenuThenDialogDemo() {
  const [bOpen, setBOpen] = useState(false);
  return (
    <>
      <Dialog open onClose={() => {}} title="First" data-testid="harness-mtd-dialog-a">
        <Menu
          label="Actions in the first dialog"
          data-testid="harness-mtd-menu"
          items={[{ id: "noop", label: "Do nothing", onSelect: () => {} }]}
        />
        <Button data-testid="harness-mtd-open-b" onClick={() => setBOpen(true)}>
          Open the second
        </Button>
      </Dialog>
      <Dialog open={bOpen} onClose={() => setBOpen(false)} title="Second" data-testid="harness-mtd-dialog-b">
        <p>Opened after the menu, so it paints above it.</p>
      </Dialog>
    </>
  );
}

// Order is what the user did, not what the kinds are: the toast was raised first, the
// tooltip asked for later, so the tooltip wins. Clicking the control focuses it, and
// focus shows the tooltip — which is what lets a click-driven tool photograph a hover
// surface at all.
function TooltipOverToastDemo() {
  const { notify } = useToast();
  return (
    <div style={{ display: "flex", gap: tokens.space.md }}>
      <Button data-testid="harness-tot-fire" onClick={() => notify("Saved", "info")}>
        Fire a toast
      </Button>
      <Tooltip label="Shown after the toast, so it paints above it" data-testid="harness-tot-tip">
        <Button data-testid="harness-tot-control">Focus me</Button>
      </Tooltip>
    </div>
  );
}

function TooltipOverToastMount() {
  return (
    <ToastProvider label="Notifications" duration={60_000}>
      <TooltipOverToastDemo />
    </ToastProvider>
  );
}

// Three nested ancestors, each creating containment a z-index cannot escape:
// contain: paint clips and isolates, content-visibility: auto adds containment of its
// own, and filter creates a stacking context. A surface in the top layer ignores all
// three; an in-place one would be clipped to an 80px box.
function PaintContainedDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div data-testid="harness-contain-outer" style={{ contain: "paint", blockSize: "120px" }}>
      <div style={{ contentVisibility: "auto", blockSize: "100px" }}>
        <div data-testid="harness-contain-inner" style={{ filter: "saturate(1)", overflow: "hidden", blockSize: "80px" }}>
          <Dialog
            open={open}
            onClose={() => setOpen(false)}
            title="Not contained"
            data-testid="harness-contained-dialog"
          >
            <p>Rendered from inside contain:paint, content-visibility:auto and a filter.</p>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

// A menu whose trigger lives inside a small scrollable box. The surface must escape the
// clip AND track the trigger when the box scrolls — the case where an in-place popup is
// both cropped and left behind.
function MenuInScrollerDemo() {
  return (
    <div
      data-testid="harness-scroller"
      style={{
        overflow: "auto",
        blockSize: "120px",
        border: `1px solid ${tokens.color.border}`,
        padding: tokens.space.sm,
      }}
    >
      <p>Scroll me.</p>
      <Menu
        label="Anchored actions"
        data-testid="harness-scroller-menu"
        items={[{ id: "noop", label: "Do nothing", onSelect: () => {} }]}
      />
      <div style={{ blockSize: "400px" }}>
        <p>Tall content below the trigger.</p>
      </div>
    </div>
  );
}

// The modal must actually be modal: with the dialog open, the counter button in the
// page behind it must be unreachable by click AND by Tab, and stay at zero.
function InertBackgroundDemo() {
  const [open, setOpen] = useState(true);
  const [clicks, setClicks] = useState(0);
  return (
    <div>
      <Button data-testid="harness-behind-button" onClick={() => setClicks((n) => n + 1)}>
        Clicked {String(clicks)} times
      </Button>
      <p data-testid="harness-behind-count">{String(clicks)}</p>
      <Dialog open={open} onClose={() => setOpen(false)} title="Blocking" data-testid="harness-inert-dialog">
        <Button data-testid="harness-inert-inner">The only reachable control</Button>
      </Dialog>
    </div>
  );
}

/** Every case's markup, keyed by `Case.id`. Structural components have no mount. */
export const mounts: Record<string, () => ReactNode> = {
  "button-variants": () => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Button data-testid="harness-btn-primary">Save</Button>
      <Button data-testid="harness-btn-secondary" variant="secondary">
        Cancel
      </Button>
      <Button data-testid="harness-btn-danger" variant="danger">
        Delete
      </Button>
      <Button data-testid="harness-btn-disabled" disabled>
        Disabled
      </Button>
    </div>
  ),

  "field-default": () => <Field label="New note" placeholder="Write a note" data-testid="harness-field" />,

  "field-error": () => (
    <Field label="New note" error="Please enter a note." data-testid="harness-field-error" />
  ),

  "select-default": () => (
    <Select
      label="Kind"
      data-testid="harness-select"
      options={[
        { value: "note", label: "Note" },
        { value: "task", label: "Task" },
      ]}
    />
  ),

  "checkbox-default": () => <Checkbox label="Pinned" data-testid="harness-checkbox" />,

  "table-populated": () => (
    <Table
      caption="People"
      data-testid="harness-table"
      emptyLabel="Nothing here yet"
      rowKey={(r) => r.id}
      rows={rows}
      columns={[
        { key: "name", header: "Name" },
        { key: "role", header: "Role" },
      ]}
    />
  ),

  "table-empty": () => (
    <Table
      caption="People"
      data-testid="harness-table-empty"
      emptyLabel="Nothing here yet"
      rowKey={(r) => r.id}
      rows={noRows}
      columns={[
        { key: "name", header: "Name" },
        { key: "role", header: "Role" },
      ]}
    />
  ),

  "tabs-default": () => (
    <Tabs
      data-testid="harness-tabs"
      tabs={[
        { id: "all", label: "All", content: <p>Everything.</p> },
        { id: "pinned", label: "Pinned", content: <p>Only pinned.</p> },
      ]}
    />
  ),

  "menu-open": () => (
    <Menu
      label="Actions"
      data-testid="harness-menu"
      items={[
        { id: "edit", label: "Edit", onSelect: () => {} },
        { id: "delete", label: "Delete", onSelect: () => {} },
      ]}
    />
  ),

  "dialog-open": () => <DialogDemo withMenu={false} />,
  "dialog-with-menu": () => <DialogDemo withMenu />,
  "dialog-stacking-trap": () => <StackingTrapDemo />,

  "tooltip-open": () => (
    <Tooltip label="Deletes the note permanently" data-testid="harness-tooltip">
      <Button data-testid="harness-tooltip-control" variant="danger">
        Delete
      </Button>
    </Tooltip>
  ),

  "toast-info": () => (
    <ToastProvider label="Notifications" duration={60_000}>
      <ToastDemo />
    </ToastProvider>
  ),

  "toast-over-modal": () => (
    <ToastProvider label="Notifications" duration={60_000}>
      <ToastOverModalDemo />
    </ToastProvider>
  ),

  "dialog-hostile-z": () => <HostileZIndexDemo />,
  "dialog-over-dialog": () => <DialogOverDialogDemo />,
  "dialog-menu-then-dialog": () => <MenuThenDialogDemo />,
  "tooltip-over-toast": () => <TooltipOverToastMount />,
  "dialog-paint-contained": () => <PaintContainedDemo />,
  "menu-in-scroller": () => <MenuInScrollerDemo />,
  "dialog-inert-background": () => <InertBackgroundDemo />,
};
