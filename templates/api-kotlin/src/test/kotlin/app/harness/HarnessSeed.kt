package app.harness

import app.domain.note.Note
import app.fixtures.InMemoryNoteRepository
import java.time.Instant
import java.util.UUID

// Deterministic seed for the e2e conformance run and the docs capture: fixed
// uuids, fixed clock - the same repository state on every machine, every run,
// which is what makes the captured examples byte-stable (BR-26).
object HarnessSeed {

    fun seed(repository: InMemoryNoteRepository) {
        repository.reset(
            listOf(
                Note(
                    UUID.fromString(HarnessCases.SEED_NOTE_ID),
                    HarnessCases.SEED_NOTE_TEXT,
                    Instant.parse(HarnessCases.SEED_CLOCK),
                ),
                Note(
                    UUID.fromString(HarnessCases.SEED_DELETE_TARGET_ID),
                    HarnessCases.SEED_DELETE_TARGET_TEXT,
                    Instant.parse(HarnessCases.SEED_CLOCK),
                ),
            ),
        )
    }
}
