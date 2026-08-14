package app.config

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

// The environment is read ONCE, here proven without one: fromEnvironment takes a
// reader, so "what happens when PORT is nonsense" is a test rather than a story.
class SettingsTest {

    @Test
    fun fallsBackToTheDocumentedDefaults() {
        val settings = Settings.fromEnvironment { null }

        assertEquals(Settings(8080, "info", "", "dev"), settings)
        // Property by property as well as by value: every consumer reads these
        // through their accessors, so the accessors are part of the contract.
        assertEquals(Settings.DEFAULT_PORT, settings.port)
        assertEquals(Settings.DEFAULT_LOG_LEVEL, settings.logLevel)
        assertEquals("", settings.databaseUrl)
        assertEquals(Settings.DEFAULT_GIT_SHA, settings.gitSha)
    }

    @Test
    fun readsTheProcessEnvironmentWhenNoReaderIsGiven() {
        // The no-argument overload is what `main` calls. Asserting the SHAPE of the
        // result keeps the case independent of the machine it runs on; asserting
        // the default reader against System.getenv directly is what proves it is
        // really the process environment behind it and not an empty stand-in.
        val settings = Settings.fromEnvironment()

        assertTrue(settings.port > 0, "a port always resolves, defaulted or read")
        assertTrue(settings.logLevel.isNotBlank())
        assertTrue(settings.gitSha.isNotBlank())
        assertEquals(
            System.getenv("PATH"),
            Settings.PROCESS_ENVIRONMENT("PATH"),
            "the default reader IS the process environment (§12.3)",
        )
    }

    @Test
    fun readsEveryDocumentedVariable() {
        val env = mapOf(
            "PORT" to "9090",
            "LOG_LEVEL" to "debug",
            "DATABASE_URL" to "jdbc:postgresql://localhost:5432/notes",
            "GIT_SHA" to "abc123",
        )

        val settings = Settings.fromEnvironment { env[it] }

        assertEquals(Settings(9090, "debug", "jdbc:postgresql://localhost:5432/notes", "abc123"), settings)
        // Through the accessors too: `equals` compares fields, so a getter that
        // returned something else would pass the comparison above unnoticed.
        assertEquals(9090, settings.port)
        assertEquals("debug", settings.logLevel)
        assertEquals("jdbc:postgresql://localhost:5432/notes", settings.databaseUrl)
        assertEquals("abc123", settings.gitSha)
    }

    @Test
    fun treatsBlankAndUnparseableValuesAsAbsent() {
        val env = mapOf("PORT" to "not-a-number", "LOG_LEVEL" to "  ", "GIT_SHA" to "", "DATABASE_URL" to "  ")

        assertEquals(Settings(8080, "info", "", "dev"), Settings.fromEnvironment { env[it] })
    }
}
