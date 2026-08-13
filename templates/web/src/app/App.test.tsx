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
  it("renders landmarks, the skip link, and the home nav", () => {
    render(<App />);
    expect(screen.getByTestId("skip-link")).toHaveAttribute("href", "#main");
    expect(screen.getByRole("heading", { name: "proto-forge prototype" })).toBeInTheDocument();
    expect(screen.getByTestId("nav-home")).toHaveAttribute("href", "/");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("routes an unknown URL to the not-found page with the shell intact", () => {
    window.history.pushState({}, "", "/no-such-page");
    render(<App />);
    expect(screen.getByTestId("not-found")).toBeInTheDocument();
    expect(screen.getByTestId("not-found-home")).toHaveAttribute("href", "/");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
