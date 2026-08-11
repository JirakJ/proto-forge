import { useState, type ReactNode } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  Menu,
  ProtoUIProvider,
  Select,
  Table,
  Tabs,
  ToastProvider,
  tokens,
  useToast,
} from "@jj/proto-ui";

// @adr 009 - the component catalogue that documentation screenshots come from
// Every exported component appears here in the states worth looking at, so
// `pnpm docs:shots` produces one image per state and `pnpm docs:verify` can prove
// the docs match today's code. This module never ships: it is only in the bundle
// when VITE_GALLERY=1, which builds gallery.html as a separate entry point.
//
// Strings here are deliberately literal. This is a fixture catalogue, not UI —
// the i18n rules are switched off for src/gallery/** for exactly that reason,
// and nothing in here is reachable from the application.

export type GalleryCase = {
  /** Stable URL fragment. Kebab-case, unique. */
  id: string;
  /** The exported component this case documents — decides the docs/ folder. */
  component: string;
  /** File name of the screenshot, and the caption in the docs. */
  name: string;
  /** What a reader should take away from this image. */
  note: string;
  /** Clicked before the screenshot, for states that only exist after interaction. */
  clickTestid?: string;
  render: () => ReactNode;
};

type Person = { id: string; name: string; role: string };

const rows: Person[] = [
  { id: "1", name: "Ada Lovelace", role: "Author" },
  { id: "2", name: "Grace Hopper", role: "Compiler" },
];
const noRows: Person[] = [];

function ToastDemo() {
  const { notify } = useToast();
  return (
    <Button data-testid="gallery-toast-fire" onClick={() => notify("Note saved")}>
      Fire a toast
    </Button>
  );
}

function DialogDemo({ withMenu }: { withMenu: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Delete note" data-testid="gallery-dialog">
      <p>This cannot be undone.</p>
      {withMenu ? (
        <Menu
          label="More actions"
          data-testid="gallery-dialog-menu"
          items={[
            { id: "archive", label: "Archive instead", onSelect: () => {} },
            { id: "export", label: "Export first", onSelect: () => {} },
          ]}
        />
      ) : null}
      <Button data-testid="gallery-dialog-confirm" variant="danger" onClick={() => setOpen(false)}>
        Delete
      </Button>
    </Dialog>
  );
}

// The adversarial case. An ancestor with `transform` creates a stacking context
// no descendant z-index can escape, and `overflow: hidden` clips whatever is left
// — together they are the single most common reason a modal "disappears". An
// in-place dialog fails here; a portalled one does not, and e2e/overlay.e2e.ts
// asserts exactly that against a real browser's paint order.
function StackingTrapDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div
        data-testid="gallery-trap-header"
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
        data-testid="gallery-trap"
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
          data-testid="gallery-trapped-dialog"
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
    <Dialog open={open} onClose={() => setOpen(false)} title="Saving" data-testid="gallery-toast-dialog">
      <ToastDemo />
    </Dialog>
  );
}

export const cases: GalleryCase[] = [
  {
    id: "button-variants",
    component: "Button",
    name: "variants",
    note: "The three variants side by side, plus the disabled state.",
    render: () => (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button data-testid="gallery-btn-primary">Save</Button>
        <Button data-testid="gallery-btn-secondary" variant="secondary">
          Cancel
        </Button>
        <Button data-testid="gallery-btn-danger" variant="danger">
          Delete
        </Button>
        <Button data-testid="gallery-btn-disabled" disabled>
          Disabled
        </Button>
      </div>
    ),
  },
  {
    id: "field-default",
    component: "Field",
    name: "default",
    note: "Label, input and placeholder in the resting state.",
    render: () => <Field label="New note" placeholder="Write a note" data-testid="gallery-field" />,
  },
  {
    id: "field-error",
    component: "Field",
    name: "error",
    note: "Invalid state: red border, aria-invalid, and the message announced via role=alert.",
    render: () => <Field label="New note" error="Please enter a note." data-testid="gallery-field-error" />,
  },
  {
    id: "select-default",
    component: "Select",
    name: "default",
    note: "Native select on the same label/error wiring as Field.",
    render: () => (
      <Select
        label="Kind"
        data-testid="gallery-select"
        options={[
          { value: "note", label: "Note" },
          { value: "task", label: "Task" },
        ]}
      />
    ),
  },
  {
    id: "checkbox-default",
    component: "Checkbox",
    name: "default",
    note: "Checkbox with the label beside it, sharing Field's a11y contract.",
    render: () => <Checkbox label="Pinned" data-testid="gallery-checkbox" />,
  },
  {
    id: "table-populated",
    component: "Table",
    name: "populated",
    note: "Caption, scoped column headers, and one testid per row and cell.",
    render: () => (
      <Table
        caption="People"
        data-testid="gallery-table"
        emptyLabel="Nothing here yet"
        rowKey={(r) => r.id}
        rows={rows}
        columns={[
          { key: "name", header: "Name" },
          { key: "role", header: "Role" },
        ]}
      />
    ),
  },
  {
    id: "table-empty",
    component: "Table",
    name: "empty",
    note: "The empty state, whose label is translated like any other string.",
    render: () => (
      <Table
        caption="People"
        data-testid="gallery-table-empty"
        emptyLabel="Nothing here yet"
        rowKey={(r) => r.id}
        rows={noRows}
        columns={[
          { key: "name", header: "Name" },
          { key: "role", header: "Role" },
        ]}
      />
    ),
  },
  {
    id: "tabs-default",
    component: "Tabs",
    name: "default",
    note: "Roving tabindex across the tablist; only the selected panel is visible.",
    render: () => (
      <Tabs
        data-testid="gallery-tabs"
        tabs={[
          { id: "all", label: "All", content: <p>Everything.</p> },
          { id: "pinned", label: "Pinned", content: <p>Only pinned.</p> },
        ]}
      />
    ),
  },
  {
    id: "menu-open",
    component: "Menu",
    name: "open",
    note: "The surface is portalled to the body and anchored to the trigger in viewport coordinates.",
    clickTestid: "gallery-menu-trigger",
    render: () => (
      <Menu
        label="Actions"
        data-testid="gallery-menu"
        items={[
          { id: "edit", label: "Edit", onSelect: () => {} },
          { id: "delete", label: "Delete", onSelect: () => {} },
        ]}
      />
    ),
  },
  {
    id: "dialog-open",
    component: "Dialog",
    name: "open",
    note: "Modal over its scrim, both portalled out of the app tree.",
    render: () => <DialogDemo withMenu={false} />,
  },
  {
    id: "dialog-with-menu",
    component: "Dialog",
    name: "menu-over-modal",
    note: "The layering guarantee, visible: a menu opened inside a modal draws above it.",
    clickTestid: "gallery-dialog-menu-trigger",
    render: () => <DialogDemo withMenu />,
  },
  {
    id: "dialog-stacking-trap",
    component: "Dialog",
    name: "escapes-stacking-trap",
    note: "The portal proven: the modal escapes an ancestor with transform + overflow:hidden, and draws over a sticky header.",
    render: () => <StackingTrapDemo />,
  },
  {
    id: "toast-info",
    component: "ToastProvider",
    name: "info",
    note: "A polite toast in the body-level region at the top of the layer scale.",
    clickTestid: "gallery-toast-fire",
    render: () => (
      <ToastProvider label="Notifications" duration={60_000}>
        <ToastDemo />
      </ToastProvider>
    ),
  },
  {
    id: "toast-over-modal",
    component: "ToastProvider",
    name: "over-modal",
    note: "A toast raised from inside a modal still draws above it — tokens.layer.toast outranks modal.",
    clickTestid: "gallery-toast-fire",
    render: () => (
      <ToastProvider label="Notifications" duration={60_000}>
        <ToastOverModalDemo />
      </ToastProvider>
    ),
  },
];

/** The gallery renders with the "own" provider — the default a prototype ships. */
export const GalleryProviders = ({ children }: { children: ReactNode }) => (
  <ProtoUIProvider provider="own">{children}</ProtoUIProvider>
);
