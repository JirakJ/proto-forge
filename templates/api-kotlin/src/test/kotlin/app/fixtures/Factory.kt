package app.fixtures

import java.util.concurrent.atomic.AtomicInteger

// Fixture data is built from the constraints it must not drift from: every
// produced value is VALIDATED against the domain's own rules, so a drifted
// default fails loudly at the call site naming the field (BR-12). Deterministic
// by construction - values derive from a counter reset before each test, never
// from Math.random or the clock, so two runs see byte-identical fixtures.
// stub:scan enforces the discipline: a fixture constant that is not a
// defineFactory(...) product is a hand-written literal waiting to drift.
object Factory {

    private val SEQUENCE = AtomicInteger()

    /** The per-test counter. Reset by resetFactorySequence before each test. */
    fun nextSequence(): Int = SEQUENCE.incrementAndGet()

    fun resetFactorySequence() {
        SEQUENCE.set(0)
    }

    /**
     * Build a factory: [defaults] receives the sequence number so ids can vary per
     * instance while staying deterministic. Every produced value is validated by
     * [check] - the factory cannot produce a value the domain would reject.
     */
    fun <T> defineFactory(check: (T) -> List<String> = { emptyList() }, defaults: (Int) -> T): () -> T = {
        val value = defaults(nextSequence())
        val violations = check(value)
        check(violations.isEmpty()) { "fixture violates its domain constraints: $violations" }
        value
    }
}
