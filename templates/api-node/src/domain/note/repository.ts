import type { Note, NoteCreate } from "./model.js";

// The persistence port: a pure interface the application depends on and the
// Drizzle adapter implements. Id and createdAt arrive stamped by the caller —
// the domain owns no clock and no id generator.
export interface NoteRepository {
  /** All notes, oldest first (createdAt, then id — a deterministic order). */
  list(): Promise<Note[]>;
  get(id: string): Promise<Note | null>;
  create(input: NoteCreate & { id: string; createdAt: string }): Promise<Note>;
  /** Returns false when no row existed under `id`. */
  delete(id: string): Promise<boolean>;
}
