package app.fixtures

import app.domain.note.Note
import app.domain.note.NoteCreate
import java.time.Instant
import java.util.UUID

/** Deterministic Note fixtures, validated through the domain constraints (BR-12). */
object NoteFixtures {

    private val EPOCH: Instant = Instant.parse("2025-01-01T00:00:00Z")

    val NOTES: () -> Note = Factory.defineFactory { seq ->
        Note(fixtureUuid(seq), "Fixture note $seq", EPOCH.plusSeconds(seq.toLong()))
    }

    val NOTE_CREATES: () -> NoteCreate =
        Factory.defineFactory(check = { it.violations() }) { seq -> NoteCreate("Fixture note $seq") }

    /** Deterministic uuid for sequence [seq] (version/variant bits fixed by hand). */
    fun fixtureUuid(seq: Int): UUID = UUID.fromString("00000000-0000-4000-8000-%012d".format(seq))
}
