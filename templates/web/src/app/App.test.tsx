import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import "@/i18n";
import { App } from "./App";
import { db } from "@/infra/persistence/db";

beforeEach(async () => {
  await db.notes.clear();
  window.history.pushState({}, "", "/");
});

describe("App shell", () => {
  it("renders landmarks, the skip link, and the home nav", async () => {
    render(<App />);
    expect(screen.getByTestId("skip-link")).toHaveAttribute("href", "#main");
    expect(screen.getByRole("heading", { name: "proto-forge prototype" })).toBeInTheDocument();
    expect(screen.getByTestId("nav-home")).toHaveAttribute("href", "/");
    expect(screen.getByRole("main")).toBeInTheDocument();
    // The home route mounts the demo feature, whose hook seeds the store and
    // sets state asynchronously. Wait for that to land so the update cannot
    // fire after the environment is torn down (an unhandled rejection under
    // Vitest 4 rather than a silent no-op).
    await screen.findAllByTestId(/^note-item-/);
  });

  it("routes an unknown URL to the not-found page with the shell intact", () => {
    window.history.pushState({}, "", "/no-such-page");
    render(<App />);
    expect(screen.getByTestId("not-found")).toBeInTheDocument();
    expect(screen.getByTestId("not-found-home")).toHaveAttribute("href", "/");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
