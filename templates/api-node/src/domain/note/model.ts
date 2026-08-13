import type { z } from "zod";
import type { NoteCreateSchema, NoteSchema } from "./schema.js";

// Derived, never hand-written — the schema is the source (§12.2).
export type Note = z.infer<typeof NoteSchema>;
export type NoteCreate = z.infer<typeof NoteCreateSchema>;
