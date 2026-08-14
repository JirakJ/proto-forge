package app.domain.note

import kotlinx.serialization.Serializable

/**
 * The create payload, and its own schema. The Kotlin template carries no
 * validation framework in the dependency budget (ADR 007), so the constraints
 * are plain functions on the type that owns them - which is the stronger form of
 * §12.2 anyway: the rule and the shape cannot drift apart because they are the
 * same declaration. [violations] returns one deterministic line per broken
 * constraint, in a fixed order, so the problem `detail` a client sees is stable
 * enough to assert on and to capture into docs examples byte-for-byte.
 */
@Serializable(with = NoteCreateSerializer::class)
public data class NoteCreate(public val text: String) {

    public fun violations(): List<String> = buildList {
        if (text.isBlank()) {
            add("$FIELD: must not be blank")
        }
        if (text.length > MAX_TEXT) {
            add("$FIELD: size must be between 0 and $MAX_TEXT")
        }
    }

    public companion object {
        public const val MAX_TEXT: Int = 2000
        private const val FIELD: String = "text"
    }
}
