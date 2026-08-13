package app.fixtures;

import app.domain.note.Note;
import app.domain.note.NoteCreate;
import java.time.Instant;
import java.util.UUID;
import java.util.function.Supplier;

/** Deterministic Note fixtures, validated through the domain constraints (BR-12). */
public final class NoteFixtures {

  private static final Instant EPOCH = Instant.parse("2025-01-01T00:00:00Z");

  public static final Supplier<Note> NOTES =
      Factory.defineFactory(seq -> new Note(fixtureUuid(seq), "Fixture note " + seq, EPOCH.plusSeconds(seq)));

  public static final Supplier<NoteCreate> NOTE_CREATES =
      Factory.defineFactory(seq -> new NoteCreate("Fixture note " + seq));

  /** Deterministic uuid for sequence {@code seq} (version/variant bits fixed by hand). */
  public static UUID fixtureUuid(int seq) {
    return UUID.fromString(String.format("00000000-0000-4000-8000-%012d", seq));
  }

  private NoteFixtures() {}
}
