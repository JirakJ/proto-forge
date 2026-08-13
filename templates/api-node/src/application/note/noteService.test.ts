import { describe, expect, it } from "vitest";
import { makeNote } from "../../domain/note/__fixtures__/noteFactory.js";
import { AppProblem } from "../../platform/problems.js";
import { makeMemoryNoteRepository } from "./__fixtures__/memoryRepo.js";
import { makeNoteService, type NoteService } from "./noteService.js";

const FIXED_NOW = "2025-06-01T08:30:00.000Z";
const FIXED_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function serviceWith(notes: Parameters<typeof makeMemoryNoteRepository>[0] = []): NoteService {
  return makeNoteService({
    repo: makeMemoryNoteRepository(notes),
    now: () => FIXED_NOW,
    newId: () => FIXED_ID,
  });
}

describe("listNotes", () => {
  it("returns every note, oldest first", async () => {
    const older = makeNote();
    const newer = makeNote();
    const service = serviceWith([newer, older]);
    expect(await service.listNotes()).toEqual([older, newer]);
  });

  it("returns an empty list from an empty store", async () => {
    expect(await serviceWith().listNotes()).toEqual([]);
  });
});

describe("getNote", () => {
  it("returns the note under the id", async () => {
    const note = makeNote();
    expect(await serviceWith([note]).getNote(note.id)).toEqual(note);
  });

  it("throws the note-not-found problem for an unknown id", async () => {
    const rejection = expect(serviceWith().getNote(FIXED_ID)).rejects;
    await rejection.toBeInstanceOf(AppProblem);
    await rejection.toMatchObject({ def: { code: "note-not-found", status: 404 } });
  });
});

describe("createNote", () => {
  it("stamps the injected id and clock onto valid input", async () => {
    const service = serviceWith();
    const created = await service.createNote({ text: "fresh" });
    expect(created).toEqual({ id: FIXED_ID, text: "fresh", createdAt: FIXED_NOW });
    expect(await service.getNote(FIXED_ID)).toEqual(created);
  });

  it("rejects input violating the schema with a field-level detail", async () => {
    const rejection = expect(serviceWith().createNote({ text: "" })).rejects;
    await rejection.toBeInstanceOf(AppProblem);
    await rejection.toMatchObject({
      def: { code: "validation-failed", status: 400 },
      detail: expect.stringContaining("text:") as unknown,
    });
  });

  it("rejects a non-object payload with a root-level detail", async () => {
    const rejection = expect(serviceWith().createNote(null)).rejects;
    await rejection.toMatchObject({
      def: { code: "validation-failed" },
      detail: "Invalid input: expected object, received null",
    });
  });
});

describe("deleteNote", () => {
  it("removes the note under the id", async () => {
    const note = makeNote();
    const service = serviceWith([note]);
    await service.deleteNote(note.id);
    expect(await service.listNotes()).toEqual([]);
  });

  it("throws the note-not-found problem when nothing was deleted", async () => {
    const rejection = expect(serviceWith().deleteNote(FIXED_ID)).rejects;
    await rejection.toBeInstanceOf(AppProblem);
    await rejection.toMatchObject({ def: { code: "note-not-found", status: 404 } });
  });
});
