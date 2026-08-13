import { render, screen } from "@testing-library/react";
import { ProtoUIProvider } from "../providers/index";
import { useOverlaySlot, type Capabilities } from "./overlay/index";
import { tokens, tokensCssEntries } from "../tokens";

// NOTE: providers/index.tsx sits outside the coverage include (packages/proto-ui/src/**),
// like tokens.ts. Tested here regardless; the include is widened when the coverage
// policy lands.

function Probe() {
  const slot = useOverlaySlot("modal", true);
  return <span data-testid="probe" data-top-layer={slot.capabilities.topLayerDialog} data-depth={slot.depth} />;
}

describe("ProtoUIProvider", () => {
  it("publishes the design tokens on the document element, where the top layer can see them", () => {
    const { unmount } = render(
      <ProtoUIProvider>
        <p data-testid="child">child</p>
      </ProtoUIProvider>,
    );
    const root = document.documentElement;
    // On the document element, not on a wrapper: an overlay in the top layer is a
    // descendant of nothing this provider renders, so a wrapper's custom properties
    // would not reach dialog::backdrop.
    expect(root.style.getPropertyValue("--pf-color-scrim")).toBe(tokens.color.scrim);
    expect(root.style.getPropertyValue("--pf-color-primary-fg")).toBe(tokens.color.primaryFg);

    unmount();
    expect(root.style.getPropertyValue("--pf-color-scrim")).toBe("");
  });

  it("publishes every token, not a hand-picked subset", () => {
    render(
      <ProtoUIProvider>
        <p data-testid="child">child</p>
      </ProtoUIProvider>,
    );
    for (const [name, value] of tokensCssEntries) {
      expect(document.documentElement.style.getPropertyValue(name)).toBe(value);
    }
  });

  it("renders its children without wrapping them in an element", () => {
    render(
      <ProtoUIProvider>
        <p data-testid="child">child</p>
      </ProtoUIProvider>,
    );
    // A wrapper would change every landmark and layout assertion in the app shell.
    expect(screen.getByTestId("child").parentElement).toBe(document.body.firstElementChild);
  });

  it("mounts the overlay stack, so a surface can claim a slot", () => {
    render(
      <ProtoUIProvider>
        <Probe />
      </ProtoUIProvider>,
    );
    expect(screen.getByTestId("probe").dataset.depth).toBe("1");
  });

  it("detects capabilities when none are pinned", () => {
    render(
      <ProtoUIProvider>
        <Probe />
      </ProtoUIProvider>,
    );
    // jsdom implements no top-layer API.
    expect(screen.getByTestId("probe").dataset.topLayer).toBe("false");
  });

  it("passes pinned capabilities through to the stack", () => {
    const pinned: Capabilities = { topLayerDialog: true, popover: true, cssAnchor: true };
    render(
      <ProtoUIProvider capabilities={pinned}>
        <Probe />
      </ProtoUIProvider>,
    );
    expect(screen.getByTestId("probe").dataset.topLayer).toBe("true");
  });
});
