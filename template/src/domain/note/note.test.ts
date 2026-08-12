import { draftNote } from "./model";
import { NoteSchema } from "./schema";
import { makeNote } from "./__fixtures__/note";

describe("Note domain", () => {
  it("drafts a note by trimming whitespace", () => {
    expect(draftNote("  hello  ")).toEqual({ text: "hello" });
  });

  it("rejects empty text", () => {
    expect(() => draftNote("   ")).toThrow();
  });

  it("rejects text over the 500-char limit", () => {
    expect(() => draftNote("x".repeat(501))).toThrow();
  });

  it("validates a full note shape", () => {
    // The fixture is schema-derived and deterministic — no randomUUID, no Date.now —
    // so the parsed round-trip and the rejection are about the same bytes every run.
    const note = makeNote({ text: "hi" });
    expect(NoteSchema.parse(note)).toEqual(note);
    expect(() => NoteSchema.parse({ ...note, id: "not-a-uuid" })).toThrow();
  });
});
