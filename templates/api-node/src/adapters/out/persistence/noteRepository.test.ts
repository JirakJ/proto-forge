import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeNote } from "../../../domain/note/__fixtures__/noteFactory.js";
import type { NoteRepository } from "../../../domain/note/repository.js";
import { makeDb, makePgDb, type DbHandle } from "./driver.js";
import { makeNoteRepository } from "./noteRepository.js";

// Against the real engine (§15): PGlite boots empty and replays db/migrations,
// so these tests also prove the migration bootstrap produces the model's schema.

let handle: DbHandle;
let repo: NoteRepository;

beforeAll(async () => {
  handle = await makeDb();
  repo = makeNoteRepository(handle.db);
});

afterAll(async () => {
  await handle.close();
});

describe("makeNoteRepository over PGlite", () => {
  it("starts empty: the migrations created the table, nothing seeded it", async () => {
    expect(await repo.list(50, 0)).toEqual({ items: [], total: 0 });
  });

  it("round-trips create, get, list and delete", async () => {
    const first = makeNote();
    const second = makeNote();
    expect(await repo.create(first)).toEqual(first);
    await repo.create(second);

    expect(await repo.get(first.id)).toEqual(first);
    expect(await repo.list(50, 0)).toEqual({ items: [first, second], total: 2 });

    expect(await repo.delete(first.id)).toBe(true);
    expect(await repo.get(first.id)).toBeNull();
    expect(await repo.list(50, 0)).toEqual({ items: [second], total: 1 });
    expect(await repo.delete(second.id)).toBe(true);
  });

  it("pages in the engine: limit and offset slice, total reports the whole table", async () => {
    const notes = [
      makeNote({ createdAt: "2025-02-01T00:00:00.000Z" }),
      makeNote({ createdAt: "2025-02-02T00:00:00.000Z" }),
      makeNote({ createdAt: "2025-02-03T00:00:00.000Z" }),
    ];
    for (const note of notes) {
      await repo.create(note);
    }

    const page = await repo.list(1, 1);
    expect(page.total).toBe(3);
    expect(page.items.map((note) => note.id)).toEqual([notes[1]?.id]);

    for (const note of notes) {
      await repo.delete(note.id);
    }
  });

  it("orders the list by createdAt, then id, regardless of insertion order", async () => {
    const later = makeNote({ createdAt: "2025-03-01T00:00:00.000Z" });
    const earlier = makeNote({ createdAt: "2025-02-01T00:00:00.000Z" });
    const tieBreak = makeNote({ createdAt: "2025-03-01T00:00:00.000Z" });
    await repo.create(later);
    await repo.create(tieBreak);
    await repo.create(earlier);

    const [a, b] = [later.id, tieBreak.id].sort();
    expect((await repo.list(50, 0)).items.map((note) => note.id)).toEqual([earlier.id, a, b]);

    for (const note of [later, earlier, tieBreak]) {
      await repo.delete(note.id);
    }
  });

  it("returns null and false for an id that never existed", async () => {
    const ghost = makeNote();
    expect(await repo.get(ghost.id)).toBeNull();
    expect(await repo.delete(ghost.id)).toBe(false);
  });
});

describe("makeDb driver selection", () => {
  it("builds a lazy node-postgres pool when a url is given, without connecting", async () => {
    const pgHandle = await makeDb("postgresql://localhost:5432/unreachable");
    expect(pgHandle.db).toBeDefined();
    await pgHandle.close();
  });

  it("exposes the pool factory directly", async () => {
    const direct = makePgDb("postgresql://localhost:5432/unreachable");
    expect(direct.db).toBeDefined();
    await direct.close();
  });
});
