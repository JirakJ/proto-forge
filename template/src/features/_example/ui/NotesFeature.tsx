import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Field, tokens } from "@jj/proto-ui";
import { useNotes } from "../hooks/useNotes";

// @adr 030 - notes example feature
// ponytail: demo feature — the self-verifying reference slice. Removed on real
// generation; real features replace it (same per-feature DoD).
export function NotesFeature() {
  const { t } = useTranslation();
  const { notes, add, remove } = useNotes();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed === "") {
      setError(t("example.error.required"));
      return;
    }
    setError("");
    await add(trimmed);
    setText("");
  };

  return (
    <section aria-labelledby="notes-heading">
      <h2 id="notes-heading" style={{ fontSize: tokens.font.sizeLg }}>
        {t("example.heading")}
      </h2>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: tokens.space.sm, alignItems: "flex-end" }}>
        <Field
          label={t("example.field.label")}
          placeholder={t("example.field.placeholder")}
          value={text}
          error={error}
          data-testid="note-input"
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" data-testid="note-add">
          {t("example.add")}
        </Button>
      </form>
      {notes.length === 0 ? (
        <p data-testid="notes-empty" style={{ color: tokens.color.muted }}>
          {t("example.empty")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, marginBlockStart: tokens.space.md }}>
          {notes.map((note) => (
            <li
              key={note.id}
              data-testid="note-item"
              style={{ display: "flex", justifyContent: "space-between", gap: tokens.space.md, marginBlockEnd: tokens.space.sm }}
            >
              <span>{note.text}</span>
              <Button
                variant="danger"
                data-testid={`note-delete-${note.id}`}
                aria-label={t("example.item.delete")}
                onClick={() => void remove(note.id)}
              >
                {t("example.item.delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
