import { asc, count, eq } from "drizzle-orm";
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
// docs examples derived from them — never depend on heap order, and it pages in
// the engine (LIMIT/OFFSET, NFR-29) so the working set never grows with the table.
export function makeNoteRepository(db: NotesDb): NoteRepository {
  return {
    async list(limit, offset) {
      const rows = await db
        .select()
        .from(notes)
        .orderBy(asc(notes.createdAt), asc(notes.id))
        .limit(limit)
        .offset(offset);
      // count() yields exactly one row; summing avoids a defensive branch no
      // test could ever reach (§3.1: unreachable code is a design problem).
      const counted = await db.select({ total: count() }).from(notes);
      const total = counted.reduce((sum, row) => sum + row.total, 0);
      return { items: rows.map(toNote), total };
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
