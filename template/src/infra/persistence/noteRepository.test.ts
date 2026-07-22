import "fake-indexeddb/auto";
import { noteRepository } from "./noteRepository";
import { noteSeed, seedIfEmpty } from "./seed";
import { db } from "./db";

beforeEach(async () => {
  await db.notes.clear();
});

describe("noteRepository (real IndexedDB)", () => {
  it("adds, lists, and removes notes", async () => {
    const a = await noteRepository.add({ text: "first" });
    const b = await noteRepository.add({ text: "second" });

    const list = await noteRepository.list();
    expect(list).toHaveLength(2);
    expect(list.map((n) => n.text).sort()).toEqual(["first", "second"]);

    await noteRepository.remove(a.id);
    const after = await noteRepository.list();
    expect(after.map((n) => n.id)).toEqual([b.id]);
  });

  it("seeds an empty store and stays idempotent", async () => {
    await seedIfEmpty(noteRepository);
    expect(await noteRepository.list()).toHaveLength(noteSeed.length);

    await seedIfEmpty(noteRepository); // store non-empty: no-op
    expect(await noteRepository.list()).toHaveLength(noteSeed.length);
  });
});
