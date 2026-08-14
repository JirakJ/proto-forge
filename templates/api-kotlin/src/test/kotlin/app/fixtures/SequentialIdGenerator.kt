package app.fixtures

import app.application.IdGenerator
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/** Deterministic id source for tests and captures: 00000000-0000-4000-8000-…N. */
class SequentialIdGenerator : IdGenerator {

    private val counter = AtomicInteger()

    override fun next(): UUID = NoteFixtures.fixtureUuid(counter.incrementAndGet())

    fun reset() {
        counter.set(0)
    }
}
