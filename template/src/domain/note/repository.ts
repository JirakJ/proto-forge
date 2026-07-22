import type { NewNote, Note } from "./model";

// Repository port (interface). Infra provides a real implementation; the domain
// never depends on how notes are stored.
export interface NoteRepository {
  list(): Promise<Note[]>;
  add(note: NewNote): Promise<Note>;
  remove(id: string): Promise<void>;
}
