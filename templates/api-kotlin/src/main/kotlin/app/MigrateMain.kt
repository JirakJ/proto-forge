package app

import app.adapters.out.persistence.migrate
import app.adapters.out.persistence.notesDataSource
import app.config.Settings
import app.platform.AppLogger

// @adr 006 - the operator's migration runner (support tool, not a gate)
//   DATABASE_URL=jdbc:postgresql://... ./gradlew dbMigrate   (or pnpm db:migrate)
//
// Applies src/main/resources/db/migration in version order against the named
// database through Flyway's transactional runner - a re-run is idempotent and a
// failed migration rolls back. The application applies the same history itself on
// startup; this entry exists for migrate-before-deploy pipelines and operator use.
public fun main() {
    val settings = Settings.fromEnvironment()
    check(settings.databaseUrl.isNotBlank()) {
        "db:migrate - DATABASE_URL is not set; name the database to migrate"
    }
    val applied = notesDataSource(settings.databaseUrl).use { migrate(it) }
    AppLogger.get("app.MigrateMain").info("migrations applied", "applied", applied)
}
