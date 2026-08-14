package app.platform

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AppLoggerTest {

    @Test
    fun renderAppendsKeyValuePairs() {
        assertEquals(
            "note created noteId=n-1 count=2",
            AppLogger.render("note created", "noteId", "n-1", "count", 2),
        )
    }

    @Test
    fun renderRedactsPiiNamedValues() {
        val line = AppLogger.render("login attempt", "password", "hunter2", "user", "u-1")

        assertTrue(line.contains("password=[redacted]"), line)
        assertFalse(line.contains("hunter2"), "a PII-keyed value must never reach a log line (NFR-12)")
        assertTrue(line.contains("user=u-1"), line)
    }

    @Test
    fun renderIgnoresADanglingKey() {
        assertEquals("shutting down", AppLogger.render("shutting down", "orphan"))
    }

    @Test
    fun everyLevelGoesThroughTheDelegate() {
        val logger = AppLogger.get("app.platform.AppLoggerTest")

        logger.info("listening", "port", 8080)
        logger.warn("slow query", "millis", 250)
        logger.error("unhandled error", "err", "IllegalStateException")
        logger.error("unhandled error with cause", IllegalStateException("boom"), "err", "IllegalStateException")
    }
}
