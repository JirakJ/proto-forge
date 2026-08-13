import Dexie, { type Table } from "dexie";
import type { Note } from "@/domain/note/model";

// Real IndexedDB store (BR-12): genuinely persists, queries, and enforces schema.
export class AppDatabase extends Dexie {
  notes!: Table<Note, string>;

  constructor() {
    super("proto-forge");
    this.version(1).stores({ notes: "id, createdAt" });
  }
}

export const db = new AppDatabase();
