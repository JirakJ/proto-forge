import { z } from "zod";

// @adr 010 - the Note demo domain
// The Note entity's single source of shape (§12.2): types derive from these
// schemas, fixtures parse through them, the contract emits from them.
export const NoteSchema = z.object({
  id: z.uuid(),
  text: z.string().min(1).max(2000),
  createdAt: z.iso.datetime(),
});

export const NoteCreateSchema = NoteSchema.pick({ text: true });
