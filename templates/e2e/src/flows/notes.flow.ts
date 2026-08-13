import { expect, type Page } from "@playwright/test";

// The Note demo's flow implementations, keyed by flow-case id (quoted keys are
// the convention registry:verify parses). One module per feature area; the
// generated spec merges every *.flow.ts module and looks implementations up by
// case id. Selectors are the web template's own testids — the flow drives the
// REAL UI against the REAL api, which is the whole point of the cross-app layer.
export const implementations: Record<string, (page: Page) => Promise<void>> = {
  "notes-create-list-delete": async (page) => {
    await page.goto("/");
    // Unique text so the flow is re-runnable against a pair that keeps state.
    const text = `e2e flow note ${Date.now().toString(36)}`;

    await page.getByTestId("note-input").fill(text);
    await page.getByTestId("note-add").click();

    const item = page.getByTestId("notes-list").locator("li").filter({ hasText: text });
    await expect(item).toBeVisible();

    await item.locator('[data-testid^="note-delete-"]').click();
    await expect(item).toHaveCount(0);
  },
};
