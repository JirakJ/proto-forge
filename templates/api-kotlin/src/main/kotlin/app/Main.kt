package app

import app.adapters.out.persistence.ExposedNoteRepository
import app.adapters.out.persistence.migrate
import app.adapters.out.persistence.notesDataSource
import app.application.IdGenerator
import app.application.NoteService
import app.config.Settings
import app.platform.AppLogger
import app.platform.ServiceInfo
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import java.time.Clock
import java.util.UUID
import org.jetbrains.exposed.v1.jdbc.Database

// Composition root - covered by the e2e conformance run, not unit coverage.
// Determinism is injected HERE and only here: the real clock and the real uuid
// source enter as constructor arguments, so everything below this file stays
// testable with pinned values.
public fun main() {
    val settings = Settings.fromEnvironment()
    check(settings.databaseUrl.isNotBlank()) {
        "DATABASE_URL is required: this service speaks to a served PostgreSQL only " +
            "(BR-12/§15 - no in-memory stand-in exists). " +
            "Example: jdbc:postgresql://localhost:5432/notes?user=notes&password=..."
    }
    val dataSource = notesDataSource(settings.databaseUrl)
    val applied = migrate(dataSource)
    val service = NoteService(
        ExposedNoteRepository(Database.connect(dataSource)),
        Clock.systemUTC(),
        IdGenerator { UUID.randomUUID() },
    )
    val log = AppLogger.get("app.Main")
    log.info("migrations applied", "applied", applied)
    log.info("listening", "port", settings.port, "gitSha", settings.gitSha)
    embeddedServer(Netty, port = settings.port, host = "0.0.0.0") {
        appModule(service, ServiceInfo(SERVICE_VERSION, settings.gitSha))
    }.start(wait = true)
}
