import type { NewNote } from "@/domain/note/model";
import type { NoteRepository } from "@/domain/note/repository";

// One-time seed dataset (BR-12): real rows loaded into the real store on first
// run, exactly like a production DB seed. The only place literal data is legal.
export const noteSeed: readonly NewNote[] = [
  { text: "Welcome to your prototype — edit or delete this note." },
  { text: "Everything here is real: this note lives in IndexedDB." },
];

export async function seedIfEmpty(repo: NoteRepository, seed: readonly NewNote[] = noteSeed): Promise<void> {
  const existing = await repo.list();
  if (existing.length === 0) {
    for (const note of seed) {
      await repo.add(note);
    }
  }
}
