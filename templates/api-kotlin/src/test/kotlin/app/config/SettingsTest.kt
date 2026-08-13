package app.config

import kotlin.test.Test
import kotlin.test.assertEquals

// The environment is read ONCE, here proven without one: fromEnvironment takes a
// reader, so "what happens when PORT is nonsense" is a test rather than a story.
class SettingsTest {

    @Test
    fun fallsBackToTheDocumentedDefaults() {
        val settings = Settings.fromEnvironment { null }

        assertEquals(Settings(8080, "info", "", "dev"), settings)
    }

    @Test
    fun readsEveryDocumentedVariable() {
        val env = mapOf(
            "PORT" to "9090",
            "LOG_LEVEL" to "debug",
            "DATABASE_URL" to "jdbc:postgresql://localhost:5432/notes",
            "GIT_SHA" to "abc123",
        )

        assertEquals(
            Settings(9090, "debug", "jdbc:postgresql://localhost:5432/notes", "abc123"),
            Settings.fromEnvironment { env[it] },
        )
    }

    @Test
    fun treatsBlankAndUnparseableValuesAsAbsent() {
        val env = mapOf("PORT" to "not-a-number", "LOG_LEVEL" to "  ", "GIT_SHA" to "", "DATABASE_URL" to "  ")

        assertEquals(Settings(8080, "info", "", "dev"), Settings.fromEnvironment { env[it] })
    }
}
