-- V0001: the Note slice's only relation. Append-only history (BR-24): corrections
-- are new migrations, never edits here. Mirrored by app.adapters.out.persistence.NotesTable.
CREATE TABLE notes (
  id uuid PRIMARY KEY,
  text text NOT NULL,
  created_at timestamptz NOT NULL
);
