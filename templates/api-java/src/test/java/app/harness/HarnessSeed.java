package app.harness;

import app.domain.note.Note;
import app.fixtures.InMemoryNoteRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

// Deterministic seed for the e2e conformance run and the docs capture: fixed
// uuids, fixed clock - the same repository state on every machine, every run,
// which is what makes the captured examples byte-stable (BR-26).
public final class HarnessSeed {

  public static void seed(InMemoryNoteRepository repository) {
    repository.reset(List.of(
        new Note(
            UUID.fromString(HarnessCases.SEED_NOTE_ID),
            HarnessCases.SEED_NOTE_TEXT,
            Instant.parse(HarnessCases.SEED_CLOCK)),
        new Note(
            UUID.fromString(HarnessCases.SEED_DELETE_TARGET_ID),
            HarnessCases.SEED_DELETE_TARGET_TEXT,
            Instant.parse(HarnessCases.SEED_CLOCK))));
  }

  private HarnessSeed() {}
}
