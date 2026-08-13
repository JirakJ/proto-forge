package app.adapter.out.persistence;

import app.domain.note.Note;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

// @adr 022 - the JPA row behind the Note repository port
//
// Mirrors src/main/resources/db/migration/V0001__notes.sql - migration:verify
// holds the two together at name level (BR-24), and the native tier proves the
// full agreement by running Flyway plus hibernate ddl-auto=validate against a
// real Postgres. The entity never invents a column the migrations do not produce.
@Entity
@Table(name = "notes")
public class NoteEntity {

  @Id
  private UUID id;

  @Column(name = "text", nullable = false, columnDefinition = "text")
  private String text;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  /** JPA only. */
  protected NoteEntity() {}

  NoteEntity(UUID id, String text, Instant createdAt) {
    this.id = id;
    this.text = text;
    this.createdAt = createdAt;
  }

  static NoteEntity fromNote(Note note) {
    return new NoteEntity(note.id(), note.text(), note.createdAt());
  }

  Note toNote() {
    return new Note(id, text, createdAt);
  }
}
