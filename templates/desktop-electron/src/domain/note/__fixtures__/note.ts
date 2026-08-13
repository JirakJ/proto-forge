import { NoteSchema } from "../schema";
import { defineFactory } from "../../../test/factory";

// The Note fixture, derived from the domain schema (BR-12): a test cannot receive a
// Note the domain would reject, and a schema change that invalidates the defaults
// fails HERE, naming the field, instead of leaving stale literals green.
//
// Importable only by *.test.* / *.e2e.* — stub:scan rejects a production import, and
// rejects any __fixtures__ export that is not built with defineFactory.

export const makeNote = defineFactory(NoteSchema, (seq) => ({
  // A valid v4 UUID with the sequence in the time-low field: deterministic AND
  // schema-valid, unlike crypto.randomUUID() (not deterministic) or `note-${seq}`
  // (not a UUID).
  id: `${String(seq).padStart(8, "0")}-0000-4000-8000-000000000000`,
  text: `Note ${seq}`,
  createdAt: 1_700_000_000_000 + seq,
}));
