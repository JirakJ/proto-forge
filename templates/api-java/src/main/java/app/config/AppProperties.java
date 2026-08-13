package app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

// @adr 001 - one pinned stack, configured from one validated source
/**
 * The single source of runtime configuration (§12.3's rule applied to the
 * service): nothing else reads the environment. application.properties maps the
 * four environment variables - PORT, LOG_LEVEL, DATABASE_URL, GIT_SHA - onto the
 * {@code app.*} keys this record binds, and derives server.port, the root log
 * level and the datasource url FROM them. DATABASE_URL has no default on purpose:
 * this service speaks to a served PostgreSQL only - an in-memory stand-in would
 * mock a first-party boundary (BR-12, §15) - so a main run without it fails fast.
 *
 * @param port HTTP port the service listens on
 * @param logLevel root SLF4J level: error | warn | info | debug | trace
 * @param databaseUrl JDBC PostgreSQL url; empty = not configured (main refuses to start)
 * @param gitSha stamped by CI into /version; "dev" locally
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(int port, String logLevel, String databaseUrl, String gitSha) {}
