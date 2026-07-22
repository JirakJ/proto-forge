import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import "@/i18n";
import { App } from "./App";
import { db } from "@/infra/persistence/db";

beforeEach(async () => {
  await db.notes.clear();
});

describe("App shell", () => {
  it("renders landmarks, the skip link, and the home nav", () => {
    render(<App />);
    expect(screen.getByTestId("skip-link")).toHaveAttribute("href", "#main");
    expect(screen.getByRole("heading", { name: "proto-forge prototype" })).toBeInTheDocument();
    expect(screen.getByTestId("nav-home")).toHaveAttribute("href", "/");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
