import type { Note, NoteCreate } from "./model.js";

/** One page of a listing plus the count the pagination envelope reports (NFR-29). */
export type NoteListPage = {
  items: Note[];
  total: number;
};

// The persistence port: a pure interface the application depends on and the
// Drizzle adapter implements. Id and createdAt arrive stamped by the caller —
// the domain owns no clock and no id generator.
export interface NoteRepository {
  /**
   * One page of notes, oldest first (createdAt, then id — a deterministic
   * order), with the total count. Listings are ALWAYS paged: the port offers no
   * way to ask for everything, so an unbounded collection cannot be built on it.
   */
  list(limit: number, offset: number): Promise<NoteListPage>;
  get(id: string): Promise<Note | null>;
  create(input: NoteCreate & { id: string; createdAt: string }): Promise<Note>;
  /** Returns false when no row existed under `id`. */
  delete(id: string): Promise<boolean>;
}
