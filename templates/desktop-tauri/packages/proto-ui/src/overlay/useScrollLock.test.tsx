import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { useScrollLock } from "./useScrollLock";

function Locker({ active }: { active: boolean }) {
  useScrollLock(active);
  return null;
}

const overflow = () => document.documentElement.style.overflow;

afterEach(() => {
  document.documentElement.style.overflow = "";
});

describe("useScrollLock", () => {
  it("holds the page still while active and lets it go afterwards", () => {
    const { unmount } = render(<Locker active />);
    expect(overflow()).toBe("hidden");
    unmount();
    expect(overflow()).toBe("");
  });

  it("does nothing while inactive", () => {
    render(<Locker active={false} />);
    expect(overflow()).toBe("");
  });

  it("keeps the lock while a second surface still needs it", () => {
    function Two() {
      const [secondOpen, setSecondOpen] = useState(true);
      return (
        <>
          <Locker active />
          <Locker active={secondOpen} />
          <button data-testid="close-second" onClick={() => setSecondOpen(false)}>
            close
          </button>
        </>
      );
    }
    const { unmount } = render(<Two />);
    expect(overflow()).toBe("hidden");

    // One of the two closes: the page must stay locked, because the other is still
    // blocking it. Releasing here is the classic two-modal bug.
    fireEvent.click(screen.getByTestId("close-second"));
    expect(overflow()).toBe("hidden");

    unmount();
    expect(overflow()).toBe("");
  });

  it("restores the value it found rather than clearing the property", () => {
    // A page that was deliberately unscrollable must still be unscrollable afterwards.
    document.documentElement.style.overflow = "clip";
    const { unmount } = render(<Locker active />);
    expect(overflow()).toBe("hidden");
    unmount();
    expect(overflow()).toBe("clip");
  });

  it("locks again after a full release, rather than latching", () => {
    function Toggling() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Locker active={open} />
          <button data-testid="toggle" onClick={() => setOpen((v) => !v)}>
            toggle
          </button>
        </>
      );
    }
    render(<Toggling />);
    expect(overflow()).toBe("hidden");
    fireEvent.click(screen.getByTestId("toggle"));
    expect(overflow()).toBe("");
    fireEvent.click(screen.getByTestId("toggle"));
    expect(overflow()).toBe("hidden");
  });
});
