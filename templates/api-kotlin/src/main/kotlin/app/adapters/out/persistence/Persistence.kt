package app.adapters.out.persistence

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import javax.sql.DataSource
import org.flywaydb.core.Flyway

// @adr 006 - one engine, one history
//
// The persistence infrastructure the composition root asks for: a pooled
// DataSource over the configured JDBC url, and the Flyway runner that applies
// src/main/resources/db/migration in version order. Both live in the OUTBOUND
// adapter - a pool and a migration history are persistence concerns, and keeping
// them here leaves the composition root a wiring file rather than a second place
// that knows about databases.

/** A pooled DataSource for [jdbcUrl]. Credentials travel inside the url (BR-29: by name, in the environment). */
public fun notesDataSource(jdbcUrl: String): HikariDataSource {
    val config = HikariConfig()
    config.jdbcUrl = jdbcUrl
    config.maximumPoolSize = MAX_POOL_SIZE
    config.isAutoCommit = false
    config.poolName = "notes"
    return HikariDataSource(config)
}

/**
 * Applies the committed migration history to [dataSource], transactionally and
 * idempotently: a re-run is a no-op and a failed migration rolls back. The same
 * history runs on startup, from `pnpm db:migrate`, and inside the native tier -
 * one code path, so "it worked in CI" means the same thing everywhere.
 */
public fun migrate(dataSource: DataSource): Int =
    Flyway.configure()
        .dataSource(dataSource)
        .locations(MIGRATIONS)
        .load()
        .migrate()
        .migrationsExecuted

private const val MAX_POOL_SIZE = 10
private const val MIGRATIONS = "classpath:db/migration"
