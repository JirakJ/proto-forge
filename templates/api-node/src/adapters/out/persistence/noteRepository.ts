import { asc, eq } from "drizzle-orm";
import type { Note } from "../../../domain/note/model.js";
import type { NoteRepository } from "../../../domain/note/repository.js";
import { notes, type NoteRow } from "./db.js";
import type { NotesDb } from "./driver.js";

// @adr 022 - the demo persistence adapter behind the Note repository port

function toNote(row: NoteRow): Note {
  return { id: row.id, text: row.text, createdAt: row.createdAt.toISOString() };
}

// The Drizzle implementation of the NoteRepository port. Listing carries an
// explicit, total order (createdAt, then id) so responses — and the captured
// docs examples derived from them — never depend on heap order.
export function makeNoteRepository(db: NotesDb): NoteRepository {
  return {
    async list() {
      const rows = await db.select().from(notes).orderBy(asc(notes.createdAt), asc(notes.id));
      return rows.map(toNote);
    },

    async get(id) {
      const rows = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
      const row = rows[0];
      return row === undefined ? null : toNote(row);
    },

    async create(input) {
      await db
        .insert(notes)
        .values({ id: input.id, text: input.text, createdAt: new Date(input.createdAt) });
      return { id: input.id, text: input.text, createdAt: input.createdAt };
    },

    async delete(id) {
      const rows = await db.delete(notes).where(eq(notes.id, id)).returning({ id: notes.id });
      return rows.length > 0;
    },
  };
}
