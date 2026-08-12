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
};
