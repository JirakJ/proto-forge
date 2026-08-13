import type { NoteRepository } from "../domain/note/repository.js";
import {
  SEED_CLOCK,
  SEED_DELETE_TARGET_ID,
  SEED_DELETE_TARGET_TEXT,
  SEED_NOTE_ID,
  SEED_NOTE_TEXT,
} from "./cases.js";

// Deterministic seed for the e2e conformance run and the docs capture: fixed
// uuids, fixed clock — the same database state on every machine, every run,
// which is what makes the captured examples byte-stable (BR-26).
export async function seedNotes(repo: NoteRepository): Promise<void> {
  await repo.create({ id: SEED_NOTE_ID, text: SEED_NOTE_TEXT, createdAt: SEED_CLOCK });
  await repo.create({
    id: SEED_DELETE_TARGET_ID,
    text: SEED_DELETE_TARGET_TEXT,
    createdAt: SEED_CLOCK,
  });
}
