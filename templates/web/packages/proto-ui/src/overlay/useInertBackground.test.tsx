import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { useInertBackground } from "./useInertBackground";
import { OVERLAY_ROOT_ID } from "../Portal";

function Holder({ active, rootId }: { active: boolean; rootId?: string }) {
  useInertBackground(active, rootId ?? "root");
  return null;
}

/** The shape a prototype actually has: an app root and a body-level overlay host. */
function appRoot() {
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
  const host = document.createElement("div");
  host.id = OVERLAY_ROOT_ID;
  document.body.append(host);
  return { root, host };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useInertBackground", () => {
  it("makes the app root inert while active, and releases it after", () => {
    const { root } = appRoot();
    const { unmount } = render(<Holder active />);
    expect(root.hasAttribute("inert")).toBe(true);
    unmount();
    expect(root.hasAttribute("inert")).toBe(false);
  });

  it("never marks the overlay host, which would make the surface itself unreachable", () => {
    const { host } = appRoot();
    render(<Holder active />);
    expect(host.hasAttribute("inert")).toBe(false);
    expect(document.body.hasAttribute("inert")).toBe(false);
  });

  it("does nothing while inactive", () => {
    const { root } = appRoot();
    render(<Holder active={false} />);
    expect(root.hasAttribute("inert")).toBe(false);
  });

  it("keeps the app root inert while a second surface still needs it", () => {
    const { root } = appRoot();
    function Two() {
      const [secondOpen, setSecondOpen] = useState(true);
      return (
        <>
          <Holder active />
          <Holder active={secondOpen} />
          <button data-testid="close-second" onClick={() => setSecondOpen(false)}>
            close
          </button>
        </>
      );
    }
    const { unmount } = render(<Two />);
    expect(root.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByTestId("close-second"));
    expect(root.hasAttribute("inert")).toBe(true);
    unmount();
    expect(root.hasAttribute("inert")).toBe(false);
  });

  it("leaves an app root that was already inert alone", () => {
    const { root } = appRoot();
    root.setAttribute("inert", "");
    const { unmount } = render(<Holder active />);
    expect(root.hasAttribute("inert")).toBe(true);
    unmount();
    // Not ours to remove: something else made it inert and still means it.
    expect(root.hasAttribute("inert")).toBe(true);
  });

  it("is a no-op when there is no app root, which is how a surface renders alone in a test", () => {
    expect(() => render(<Holder active />)).not.toThrow();
  });

  it("honours a different app root id", () => {
    const shell = document.createElement("div");
    shell.id = "app-shell";
    document.body.append(shell);
    render(<Holder active rootId="app-shell" />);
    expect(shell.hasAttribute("inert")).toBe(true);
  });
});
