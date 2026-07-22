import { draftNote } from "./model";
import { NoteSchema } from "./schema";

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
    const note = { id: crypto.randomUUID(), text: "hi", createdAt: Date.now() };
    expect(NoteSchema.parse(note)).toEqual(note);
    expect(() => NoteSchema.parse({ ...note, id: "not-a-uuid" })).toThrow();
  });
});
