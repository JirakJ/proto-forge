import { db } from "./db";
import { NoteSchema } from "@/domain/note/schema";
import type { NewNote, Note } from "@/domain/note/model";
import type { NoteRepository } from "@/domain/note/repository";

// @adr 022 - real IndexedDB persistence adapter
// Real NoteRepository backed by IndexedDB. Responses are zod-validated at the
// boundary (BRS §4.1) so nothing malformed enters the domain.
export const noteRepository: NoteRepository = {
  async list(): Promise<Note[]> {
    const rows = await db.notes.orderBy("createdAt").reverse().toArray();
    return rows.map((row) => NoteSchema.parse(row));
  },
  async add(note: NewNote): Promise<Note> {
    const created = NoteSchema.parse({
      id: crypto.randomUUID(),
      text: note.text,
      createdAt: Date.now(),
    });
    await db.notes.add(created);
    return created;
  },
  async remove(id: string): Promise<void> {
    await db.notes.delete(id);
  },
};
