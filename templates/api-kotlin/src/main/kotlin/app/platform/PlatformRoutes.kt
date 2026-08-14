package app.platform

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respondText
import io.ktor.server.routing.Routing
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer

// PLATFORM routes, deliberately outside the route registry and the contract:
// /healthz and /version are infrastructure a load balancer or deploy probe talks
// to, not API surface a consumer programs against - so they carry no operationId,
// no docs examples and no contract entry (opid:scan exempts the kernel).
//
// The tailcard route is the kernel's other half of BR-23: Ktor answers an
// unmatched path with a bare 404 and no body, which is an error shape the
// catalogue does not describe. Routing resolution scores constant segments above
// a tailcard, so every registered operation still wins; anything left over -
// unknown path, or a method no route declares - lands here and leaves as the
// registered "route-not-found" problem through the StatusPages install.
public fun Routing.installPlatformRoutes(info: ServiceInfo) {
    get("/healthz") {
        call.respondText(
            text = AppJson.encodeToString(STRING_MAP, mapOf("status" to "ok")),
            contentType = ContentType.Application.Json,
            status = HttpStatusCode.OK,
        )
    }
    get("/version") {
        call.respondText(
            text = AppJson.encodeToString(STRING_MAP, mapOf("version" to info.version, "gitSha" to info.gitSha)),
            contentType = ContentType.Application.Json,
            status = HttpStatusCode.OK,
        )
    }
    route("{...}") {
        handle {
            throw AppProblem("route-not-found")
        }
    }
}

private val STRING_MAP = MapSerializer(String.serializer(), String.serializer())
