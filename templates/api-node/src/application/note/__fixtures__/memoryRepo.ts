import type { Note } from "../../../domain/note/model.js";
import type { NoteRepository } from "../../../domain/note/repository.js";

// Test FIXTURE, imported only by tests: an in-memory implementation of the
// NoteRepository port with the same observable semantics as the Drizzle adapter
// (list ordered by createdAt then id). The REAL adapter lives in
// src/adapters/out/persistence and is tested against PGlite.
export function makeMemoryNoteRepository(initial: readonly Note[] = []): NoteRepository {
  const store = new Map(initial.map((note) => [note.id, note] as const));

  const ordered = (): Note[] =>
    [...store.values()].sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.id.localeCompare(b.id)
        : a.createdAt.localeCompare(b.createdAt),
    );

  return {
    list: (limit, offset) =>
      Promise.resolve({ items: ordered().slice(offset, offset + limit), total: store.size }),
    get: (id) => Promise.resolve(store.get(id) ?? null),
    create: (input) => {
      const note: Note = { id: input.id, text: input.text, createdAt: input.createdAt };
      store.set(note.id, note);
      return Promise.resolve(note);
    },
    delete: (id) => Promise.resolve(store.delete(id)),
  };
}
