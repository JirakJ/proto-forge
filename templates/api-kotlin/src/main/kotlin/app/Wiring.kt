package app

import app.adapters.`in`.http.NoteHandlers
import app.adapters.`in`.http.RouteRegistry
import app.adapters.`in`.http.registerRoutes
import app.application.NoteService
import app.platform.SecurityHeaders
import app.platform.ServiceInfo
import app.platform.installPlatformRoutes
import app.platform.installProblemPages
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.routing.routing

// The composition surface: the ONE function that turns a wired NoteService into a
// running HTTP application. Production calls it from `main` over the Exposed
// repository, a real clock and random uuids; the slices call the SAME function
// over the fixture repository with a fixed clock and sequential ids, which is
// what makes the conformance run and the captured examples byte-stable (BR-26)
// while still exercising the production kernel, registrar and routes.
public fun Application.appModule(service: NoteService, info: ServiceInfo) {
    install(SecurityHeaders)
    installProblemPages()
    routing {
        registerRoutes(RouteRegistry.ROUTES, NoteHandlers(service).handlers())
        installPlatformRoutes(info)
    }
}

/** The service's own version, reported by /version and by the emitted contract. */
public const val SERVICE_VERSION: String = "0.1.0"
