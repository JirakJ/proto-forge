import { type z } from "zod";
import { NewNoteSchema, NoteSchema } from "./schema";

export type Note = z.infer<typeof NoteSchema>;
export type NewNote = z.infer<typeof NewNoteSchema>;

// @adr 010 - Note domain model derived from zod schema
// Pure domain factory: normalises and validates user input into a NewNote.
// Throws (zod) on empty/oversized text — the boundary rejects bad input.
export function draftNote(text: string): NewNote {
  return NewNoteSchema.parse({ text: text.trim() });
}
