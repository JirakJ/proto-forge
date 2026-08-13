package app.platform

import org.slf4j.Logger
import org.slf4j.LoggerFactory

// Structured, redacting logging only (NFR-12): production code logs through this
// kernel wrapper, never println/System.out and never a bare SLF4J logger. The
// redaction list is the PII denylist - a value keyed by one of these names never
// leaves the process in clear text, even when a caller slips.
public class AppLogger private constructor(private val delegate: Logger) {

    /** Structured call: a message plus alternating key/value pairs. */
    public fun info(message: String, vararg keyValues: Any?): Unit = delegate.info(render(message, *keyValues))

    public fun warn(message: String, vararg keyValues: Any?): Unit = delegate.warn(render(message, *keyValues))

    public fun error(message: String, vararg keyValues: Any?): Unit = delegate.error(render(message, *keyValues))

    public fun error(message: String, cause: Throwable, vararg keyValues: Any?): Unit =
        delegate.error(render(message, *keyValues), cause)

    public companion object {
        private val PII = Regex(
            "password|passwd|secret|token|authorization|ssn|creditcard|email",
            RegexOption.IGNORE_CASE,
        )

        /** The one way production code obtains a logger. */
        public fun get(owner: String): AppLogger = AppLogger(LoggerFactory.getLogger(owner))

        /** `message key=value ...`, with PII-named values replaced by `[redacted]`. */
        public fun render(message: String, vararg keyValues: Any?): String {
            val out = StringBuilder(message)
            var i = 0
            while (i + 1 < keyValues.size) {
                val key = keyValues[i].toString()
                val value = if (PII.containsMatchIn(key)) "[redacted]" else keyValues[i + 1]
                out.append(' ').append(key).append('=').append(value)
                i += 2
            }
            return out.toString()
        }
    }
}
