import { render, screen, fireEvent } from "@testing-library/react";
import { useRef, useState, type ReactNode } from "react";
import { useFocusScope } from "./useFocusScope";

// Every focus behaviour Dialog proved before the extraction is asserted here, so the
// move cannot quietly drop one. The new cases are the ones Dialog could not express:
// initialFocus, trap: false, and return-through-a-stack.

type SurfaceProps = {
  name: string;
  active?: boolean;
  trap?: boolean;
  initialFocus?: "container" | "first";
  children?: ReactNode;
};

function Surface({ name, active = true, trap = true, initialFocus = "container", children }: SurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusScope({ ref, active, trap, initialFocus });
  return active ? (
    <div ref={ref} tabIndex={-1} data-testid={name}>
      {children}
    </div>
  ) : null;
}

const tab = (target: Element, shiftKey = false) => fireEvent.keyDown(target, { key: "Tab", shiftKey });

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useFocusScope — entry", () => {
  it("focuses the surface itself by default", () => {
    render(<Surface name="s" />);
    expect(document.activeElement).toBe(screen.getByTestId("s"));
  });

  it("focuses the first focusable child when asked", () => {
    render(
      <Surface name="s" initialFocus="first">
        <button data-testid="one">One</button>
        <button data-testid="two">Two</button>
      </Surface>,
    );
    expect(document.activeElement).toBe(screen.getByTestId("one"));
  });

  it("falls back to the surface when initialFocus=first finds nothing focusable", () => {
    render(
      <Surface name="s" initialFocus="first">
        <p data-testid="prose">nothing focusable here</p>
      </Surface>,
    );
    expect(document.activeElement).toBe(screen.getByTestId("s"));
  });

  it("does nothing while inactive", () => {
    render(<Surface name="s" active={false} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("does nothing when the ref never attaches", () => {
    function Headless() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusScope({ ref, active: true, trap: true });
      return null;
    }
    expect(() => render(<Headless />)).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("useFocusScope — trap", () => {
  it("wraps Tab from the last focusable to the first", () => {
    render(
      <Surface name="s">
        <button data-testid="one">One</button>
        <button data-testid="two">Two</button>
      </Surface>,
    );
    const one = screen.getByTestId("one");
    const two = screen.getByTestId("two");
    two.focus();
    tab(two);
    expect(document.activeElement).toBe(one);
  });

  it("wraps Shift+Tab from the first focusable to the last", () => {
    render(
      <Surface name="s">
        <button data-testid="one">One</button>
        <button data-testid="two">Two</button>
      </Surface>,
    );
    const one = screen.getByTestId("one");
    one.focus();
    tab(one, true);
    expect(document.activeElement).toBe(screen.getByTestId("two"));
  });

  it("wraps Shift+Tab from the surface container to the last focusable", () => {
    render(
      <Surface name="s">
        <button data-testid="one">One</button>
        <button data-testid="two">Two</button>
      </Surface>,
    );
    const surface = screen.getByTestId("s");
    surface.focus();
    tab(surface, true);
    expect(document.activeElement).toBe(screen.getByTestId("two"));
  });

  it("leaves Tab alone in the middle of the sequence", () => {
    render(
      <Surface name="s">
        <button data-testid="one">One</button>
        <button data-testid="two">Two</button>
        <button data-testid="three">Three</button>
      </Surface>,
    );
    const two = screen.getByTestId("two");
    two.focus();
    tab(two);
    // No wrap and no preventDefault: the browser moves to "three" on its own.
    expect(document.activeElement).toBe(two);
  });

  it("leaves Shift+Tab alone when it is neither at the first nor on the container", () => {
    render(
      <Surface name="s">
        <button data-testid="one">One</button>
        <button data-testid="two">Two</button>
      </Surface>,
    );
    const two = screen.getByTestId("two");
    two.focus();
    tab(two, true);
    expect(document.activeElement).toBe(two);
  });

  it("keeps Tab on the surface when there is nothing focusable inside", () => {
    render(<Surface name="s" />);
    const surface = screen.getByTestId("s");
    tab(surface);
    expect(document.activeElement).toBe(surface);
  });

  it("ignores keys that are not Tab", () => {
    render(
      <Surface name="s">
        <button data-testid="one">One</button>
      </Surface>,
    );
    const one = screen.getByTestId("one");
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowDown" });
    expect(document.activeElement).toBe(one);
  });

  it("installs no Tab handling when trap is false — the platform already does it", () => {
    render(
      <Surface name="s" trap={false}>
        <button data-testid="one">One</button>
        <button data-testid="two">Two</button>
      </Surface>,
    );
    const two = screen.getByTestId("two");
    two.focus();
    tab(two);
    // Not wrapped: without a trap the browser's own order applies.
    expect(document.activeElement).toBe(two);
  });
});

describe("useFocusScope — return", () => {
  it("returns focus to whatever was focused before it opened", () => {
    function Opening() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button data-testid="opener" onClick={() => setOpen(true)}>
            open
          </button>
          <Surface name="s" active={open}>
            <button data-testid="close" onClick={() => setOpen(false)}>
              close
            </button>
          </Surface>
        </>
      );
    }
    render(<Opening />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByTestId("s"));

    fireEvent.click(screen.getByTestId("close"));
    expect(document.activeElement).toBe(opener);
  });

  it("returns focus through a stack: closing the inner surface lands inside the outer one", () => {
    function Nested() {
      const [innerOpen, setInnerOpen] = useState(false);
      return (
        <Surface name="outer">
          <button data-testid="open-inner" onClick={() => setInnerOpen(true)}>
            open inner
          </button>
          <Surface name="inner" active={innerOpen} initialFocus="first">
            <button data-testid="close-inner" onClick={() => setInnerOpen(false)}>
              close inner
            </button>
          </Surface>
        </Surface>
      );
    }
    render(<Nested />);
    const openInner = screen.getByTestId("open-inner");
    openInner.focus();
    fireEvent.click(openInner);
    expect(document.activeElement).toBe(screen.getByTestId("close-inner"));

    fireEvent.click(screen.getByTestId("close-inner"));
    // Back inside the outer surface, not out to the page.
    expect(document.activeElement).toBe(openInner);
    expect(screen.getByTestId("outer")).toContainElement(document.activeElement as HTMLElement);
  });
});
