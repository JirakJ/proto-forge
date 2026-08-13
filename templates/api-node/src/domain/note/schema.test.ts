import { describe, expect, it } from "vitest";
import { makeNote, makeNoteCreate } from "./__fixtures__/noteFactory.js";
import { NoteCreateSchema, NoteSchema } from "./schema.js";

describe("NoteSchema", () => {
  it("accepts a factory-built note and keeps its fields verbatim", () => {
    const note = makeNote();
    expect(NoteSchema.parse(note)).toEqual(note);
    expect(note.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(note.createdAt).toBe("2025-01-01T00:00:01.000Z");
  });

  it("rejects a non-uuid id", () => {
    const note = makeNote();
    expect(NoteSchema.safeParse({ ...note, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a createdAt that is not an ISO datetime", () => {
    const note = makeNote();
    expect(NoteSchema.safeParse({ ...note, createdAt: "yesterday" }).success).toBe(false);
  });

  it("accepts text at exactly the 2000-character ceiling", () => {
    const note = makeNote({ text: "x".repeat(2000) });
    expect(note.text).toHaveLength(2000);
  });

  it("rejects empty text and text past the ceiling", () => {
    const note = makeNote();
    expect(NoteSchema.safeParse({ ...note, text: "" }).success).toBe(false);
    expect(NoteSchema.safeParse({ ...note, text: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("NoteCreateSchema", () => {
  it("accepts only the text field", () => {
    expect(makeNoteCreate()).toEqual({ text: "Fixture note 1" });
  });

  it("strips fields outside the creation shape", () => {
    const parsed = NoteCreateSchema.parse({ text: "kept", id: "dropped" });
    expect(parsed).toEqual({ text: "kept" });
  });

  it("rejects a missing text field", () => {
    expect(NoteCreateSchema.safeParse({}).success).toBe(false);
  });
});
