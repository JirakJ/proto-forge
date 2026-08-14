package slices

import app.SERVICE_VERSION
import app.application.NoteService
import app.appModule
import app.fixtures.InMemoryNoteRepository
import app.fixtures.SequentialIdGenerator
import app.harness.HarnessCases
import app.harness.HarnessSeed
import app.platform.ServiceInfo
import io.ktor.server.application.Application
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

// The pinned composition for slices: fixture repository port, fixed clock,
// sequential ids. Everything ABOVE the port is the production wiring - the same
// appModule main calls - so the test application exercises the real kernel,
// registrar and routes with no socket and no database. The real adapter is
// proven separately against a real Postgres in the native tier (§15).
class SliceFixture {

    val repository: InMemoryNoteRepository = InMemoryNoteRepository()
    val ids: SequentialIdGenerator = SequentialIdGenerator()

    private val service = NoteService(
        repository,
        Clock.fixed(Instant.parse(HarnessCases.SEED_CLOCK), ZoneOffset.UTC),
        ids,
    )

    /** Seed the fixture repository and rewind the id counter - a known start state. */
    fun rewind() {
        HarnessSeed.seed(repository)
        ids.reset()
    }

    fun install(application: Application) {
        application.appModule(service, ServiceInfo(SERVICE_VERSION, "dev"))
    }
}
