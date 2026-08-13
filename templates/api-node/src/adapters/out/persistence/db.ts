import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Mirrors db/migrations/0001_notes.sql — migration:verify holds the two together
// (BR-24). The model never invents a column the migrations do not produce.
export const notes = pgTable("notes", {
  id: uuid("id").primaryKey(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
});

export type NoteRow = typeof notes.$inferSelect;
