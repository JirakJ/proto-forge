import { defineFactory } from "../../__fixtures__/factory.js";
import { NoteCreateSchema, NoteSchema } from "../schema.js";

const EPOCH_MS = Date.UTC(2025, 0, 1);

/** Deterministic uuid for sequence `seq` (version/variant bits fixed by hand). */
function fixtureUuid(seq: number): string {
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

export const makeNote = defineFactory(NoteSchema, (seq) => ({
  id: fixtureUuid(seq),
  text: `Fixture note ${String(seq)}`,
  createdAt: new Date(EPOCH_MS + seq * 1000).toISOString(),
}));

export const makeNoteCreate = defineFactory(NoteCreateSchema, (seq) => ({
  text: `Fixture note ${String(seq)}`,
}));
