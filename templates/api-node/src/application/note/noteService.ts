import { NoteCreateSchema } from "../../domain/note/schema.js";
import type { Note } from "../../domain/note/model.js";
import type { NoteRepository } from "../../domain/note/repository.js";
import { AppProblem } from "../../platform/problems.js";
import { validationDetail } from "../validation.js";

export type NoteServiceDeps = {
  repo: NoteRepository;
  /** Injected clock: an ISO datetime string. Production wires Date; tests a constant. */
  now: () => string;
  /** Injected id source. Production wires crypto.randomUUID; tests a counter. */
  newId: () => string;
};

// Use-cases over the port. Every client-visible failure is a registered problem
// (BR-23); ids and timestamps come from injected dependencies, so the service
// itself is deterministic and the e2e capture is byte-stable.
export function makeNoteService({ repo, now, newId }: NoteServiceDeps) {
  return {
    listNotes: (): Promise<Note[]> => repo.list(),

    async getNote(id: string): Promise<Note> {
      const note = await repo.get(id);
      if (note === null) {
        throw new AppProblem("note-not-found");
      }
      return note;
    },

    async createNote(input: unknown): Promise<Note> {
      const parsed = NoteCreateSchema.safeParse(input);
      if (!parsed.success) {
        throw new AppProblem("validation-failed", validationDetail(parsed.error));
      }
      return repo.create({ ...parsed.data, id: newId(), createdAt: now() });
    },

    async deleteNote(id: string): Promise<void> {
      const deleted = await repo.delete(id);
      if (!deleted) {
        throw new AppProblem("note-not-found");
      }
    },
  };
}

export type NoteService = ReturnType<typeof makeNoteService>;
