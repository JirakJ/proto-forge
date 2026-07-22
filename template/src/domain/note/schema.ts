import { z } from "zod";

// Domain schema for a Note. The TS type is derived from this via z.infer
// (never hand-duplicated) — the single source of the shape (BRS §12.3).
export const NoteSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1).max(500),
  createdAt: z.number().int(),
});

export const NewNoteSchema = NoteSchema.omit({ id: true, createdAt: true });
