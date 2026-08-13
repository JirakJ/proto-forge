package app.config

// @adr 001 - one pinned stack, configured from one validated source
/**
 * The single source of runtime configuration (§12.3's rule applied to the
 * service): nothing else reads the environment. [fromEnvironment] is called
 * exactly once, in the composition root, and every consumer receives the value
 * object - so "what does this service read?" is answered by this file and no
 * grep. `DATABASE_URL` has no default on purpose: this service speaks to a
 * served PostgreSQL only - an in-memory stand-in would mock a first-party
 * boundary (BR-12, §15) - so a main run without it fails fast.
 *
 * @property port HTTP port the service listens on
 * @property logLevel root SLF4J level: error | warn | info | debug | trace
 * @property databaseUrl JDBC PostgreSQL url; empty = not configured (main refuses to start)
 * @property gitSha stamped by CI into /version; "dev" locally
 */
public data class Settings(
    public val port: Int,
    public val logLevel: String,
    public val databaseUrl: String,
    public val gitSha: String,
) {
    public companion object {
        public const val DEFAULT_PORT: Int = 8080
        public const val DEFAULT_LOG_LEVEL: String = "info"
        public const val DEFAULT_GIT_SHA: String = "dev"

        /**
         * Reads the four documented variables (.env.example lists exactly these).
         * [read] is a seam, not a second source: production passes the process
         * environment, tests pass a map so configuration is provable without one.
         */
        public fun fromEnvironment(read: (String) -> String? = { System.getenv(it) }): Settings = Settings(
            port = read("PORT")?.trim()?.toIntOrNull() ?: DEFAULT_PORT,
            logLevel = read("LOG_LEVEL")?.trim()?.takeIf { it.isNotEmpty() } ?: DEFAULT_LOG_LEVEL,
            databaseUrl = read("DATABASE_URL")?.trim().orEmpty(),
            gitSha = read("GIT_SHA")?.trim()?.takeIf { it.isNotEmpty() } ?: DEFAULT_GIT_SHA,
        )
    }
}
