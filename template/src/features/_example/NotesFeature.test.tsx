import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { NotesFeature } from "./ui/NotesFeature";
import { db } from "@/infra/persistence/db";

beforeEach(async () => {
  await db.notes.clear();
});

describe("NotesFeature", () => {
  it("seeds, validates, adds and deletes notes down to the empty state", async () => {
    const user = userEvent.setup();
    render(<NotesFeature />);

    // Seed loads on mount.
    await waitFor(() => expect(screen.getAllByTestId("note-item").length).toBeGreaterThan(0));

    // Empty submit is rejected with an announced error.
    await user.click(screen.getByTestId("note-add"));
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a note.");

    // Valid submit adds a note and clears the error.
    await user.type(screen.getByTestId("note-input"), "My note");
    await user.click(screen.getByTestId("note-add"));
    await waitFor(() => expect(screen.getByText("My note")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();

    // Deleting every note reveals the empty state.
    for (;;) {
      const remaining = screen.queryAllByTestId("note-item");
      if (remaining.length === 0) break;
      await user.click(within(remaining[0]!).getByRole("button"));
      await waitFor(() => expect(screen.queryAllByTestId("note-item").length).toBe(remaining.length - 1));
    }
    expect(screen.getByTestId("notes-empty")).toBeInTheDocument();
  });
});
