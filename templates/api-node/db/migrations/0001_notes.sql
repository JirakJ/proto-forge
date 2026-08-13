-- 0001: the Note slice's only relation. Append-only history (BR-24): corrections
-- are new migrations, never edits here. Mirrored by src/adapters/out/persistence/db.ts.
CREATE TABLE notes (
  id uuid PRIMARY KEY,
  text text NOT NULL,
  created_at timestamptz NOT NULL
);
