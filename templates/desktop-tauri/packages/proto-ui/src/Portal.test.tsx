import { render, screen } from "@testing-library/react";
import { Portal, OVERLAY_ROOT_ID } from "./Portal";

describe("Portal", () => {
  afterEach(() => {
    document.getElementById(OVERLAY_ROOT_ID)?.remove();
  });

  it("renders its children into a body-level host, not in place", () => {
    render(
      <div data-testid="in-tree">
        <Portal>
          <span data-testid="popup">hi</span>
        </Portal>
      </div>,
    );
    const host = document.getElementById(OVERLAY_ROOT_ID)!;
    const popup = screen.getByTestId("popup");
    expect(host.parentElement).toBe(document.body);
    expect(host).toContainElement(popup);
    expect(screen.getByTestId("in-tree")).not.toContainElement(popup);
  });

  it("is the last child of body, so nothing in the app tree paints over it", () => {
    render(
      <Portal>
        <span data-testid="popup">hi</span>
      </Portal>,
    );
    expect(document.body.lastElementChild).toBe(document.getElementById(OVERLAY_ROOT_ID));
  });

  it("reuses one host across concurrent overlays instead of stacking hosts", () => {
    render(
      <>
        <Portal>
          <span data-testid="a">a</span>
        </Portal>
        <Portal>
          <span data-testid="b">b</span>
        </Portal>
      </>,
    );
    expect(document.querySelectorAll(`#${OVERLAY_ROOT_ID}`)).toHaveLength(1);
    const host = document.getElementById(OVERLAY_ROOT_ID)!;
    expect(host).toContainElement(screen.getByTestId("a"));
    expect(host).toContainElement(screen.getByTestId("b"));
  });

  it("removes the portalled content on unmount but keeps the host reusable", () => {
    const { unmount } = render(
      <Portal>
        <span data-testid="popup">hi</span>
      </Portal>,
    );
    unmount();
    expect(screen.queryByTestId("popup")).toBeNull();
    expect(document.getElementById(OVERLAY_ROOT_ID)).not.toBeNull();
  });
});
