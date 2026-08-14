package app.persistence

import app.adapters.out.persistence.ExposedNoteRepository
import app.adapters.out.persistence.migrate
import app.adapters.out.persistence.notesDataSource
import app.domain.note.Note
import java.time.Instant
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.jetbrains.exposed.v1.jdbc.Database
import org.junit.jupiter.api.Tag
import org.testcontainers.containers.PostgreSQLContainer

// @adr 006 - the real-database tier (BRS §15): no in-memory stand-in exists
//
// Runs the committed migration history against Testcontainers Postgres, reads the
// live catalog back to prove the Exposed table and the schema Flyway produced
// agree column for column (BR-24), and then drives the adapter through real SQL -
// ordering, the timestamptz round trip, and the not-found paths.
//
// Tool-gated tier (`./gradlew nativeTest`): Docker may be absent on a local
// machine, so the tag is excluded from `test` and CI runs it unconditionally on a
// Docker-equipped runner (ADR 003).
@Tag("native")
class PersistenceNativeTest {

    private val postgres = PostgreSQLContainer("postgres:16-alpine")

    private val first = UUID.fromString("11111111-1111-4111-8111-111111111111")
    private val second = UUID.fromString("22222222-2222-4222-8222-222222222222")
    private val clock: Instant = Instant.parse("2025-01-01T12:00:00Z")

    @AfterTest
    fun stopContainer() {
        if (postgres.isRunning) {
            postgres.stop()
        }
    }

    @Test
    fun theCommittedHistoryProducesTheSchemaTheTableDescribes() {
        postgres.start()
        val dataSource = notesDataSource(jdbcUrlWithCredentials())
        assertEquals(1, migrate(dataSource), "the committed history applies in one step")

        // Model agreement, natively: read the catalog Flyway produced and compare it
        // with the columns the Exposed table declares. `flyway validate` proves the
        // history has not been rewritten; THIS proves the model matches the result.
        val live = mutableMapOf<String, String>()
        dataSource.connection.use { connection ->
            connection.metaData.getColumns(null, "public", "notes", null).use { rows ->
                while (rows.next()) {
                    live[rows.getString("COLUMN_NAME")] = rows.getString("TYPE_NAME")
                }
            }
        }
        assertEquals(setOf("id", "text", "created_at"), live.keys)
        assertEquals("uuid", live["id"])
        assertEquals("text", live["text"])
        assertEquals("timestamptz", live["created_at"])

        val repository = ExposedNoteRepository(Database.connect(dataSource))
        val older = Note(first, "First seeded note.", clock)
        val newer = Note(second, "Second seeded note.", clock.plusSeconds(60))

        assertEquals(newer, repository.create(newer))
        assertEquals(older, repository.create(older))
        assertEquals(
            listOf(first, second),
            repository.list().map { it.id },
            "createdAt then id - a total order, independent of insert order",
        )
        assertEquals(older, repository.get(first))
        assertNull(repository.get(UUID.fromString("99999999-9999-4999-8999-999999999999")))
        assertTrue(repository.delete(second))
        assertFalse(repository.delete(second))
        assertEquals(1, repository.list().size)
        dataSource.close()
    }

    private fun jdbcUrlWithCredentials(): String =
        "${postgres.jdbcUrl}&user=${postgres.username}&password=${postgres.password}"
}
