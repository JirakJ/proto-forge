package app.e2e

import app.SERVICE_VERSION
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import slices.SliceFixture

// The kernel's own contract, exercised through the SAME application module main
// runs. The conformance replay proves the registry's operations; these cases
// prove the things that surround them and that no operation declares: the
// security headers on every response, the operational endpoints, the fallback
// that turns Ktor's bodyless 404 into a registered problem, and the boundary
// rejections a malformed request earns.
class PlatformSliceTest {

    private val parser = Json { ignoreUnknownKeys = true }

    @Test
    fun healthzReportsTheProcessIsAlive() = testApplication {
        val fixture = SliceFixture()
        application { fixture.install(this) }

        val response = client.get("/healthz")

        assertEquals(200, response.status.value)
        assertEquals("ok", parser.parseToJsonElement(response.bodyAsText()).jsonObject["status"]?.jsonPrimitive?.content)
    }

    @Test
    fun versionReportsWhichBuildIsAnswering() = testApplication {
        val fixture = SliceFixture()
        application { fixture.install(this) }

        val body = parser.parseToJsonElement(client.get("/version").bodyAsText()).jsonObject

        assertEquals(SERVICE_VERSION, body["version"]?.jsonPrimitive?.content)
        assertEquals("dev", body["gitSha"]?.jsonPrimitive?.content)
    }

    @Test
    fun everyResponseCarriesTheSecurityBaselineHeaders() = testApplication {
        val fixture = SliceFixture()
        application { fixture.install(this) }
        fixture.rewind()

        for (path in listOf("/healthz", "/notes", "/nothing-here")) {
            val headers = client.get(path).headers
            assertEquals("nosniff", headers["X-Content-Type-Options"], path)
            assertEquals("DENY", headers["X-Frame-Options"], path)
            assertEquals("strict-origin-when-cross-origin", headers["Referrer-Policy"], path)
            assertEquals("no-store", headers[HttpHeaders.CacheControl], path)
            assertEquals("default-src 'none'", headers["Content-Security-Policy"], path)
        }
    }

    @Test
    fun anUnmatchedPathIsTheRegisteredRouteNotFoundProblem() = testApplication {
        val fixture = SliceFixture()
        application { fixture.install(this) }
        fixture.rewind()

        val response = client.get("/nothing-here")

        assertEquals(404, response.status.value)
        assertTrue(
            response.headers[HttpHeaders.ContentType].orEmpty().startsWith("application/problem+json"),
            response.headers[HttpHeaders.ContentType].orEmpty(),
        )
        val body = parser.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("route-not-found", body["code"]?.jsonPrimitive?.content)
        assertEquals("/problems/route-not-found", body["type"]?.jsonPrimitive?.content)
        assertEquals("/nothing-here", body["instance"]?.jsonPrimitive?.content)
        assertEquals(404, body["status"]?.jsonPrimitive?.content?.toInt())
    }

    @Test
    fun aMethodNoRouteDeclaresIsTheSameRegisteredProblem() = testApplication {
        val fixture = SliceFixture()
        application { fixture.install(this) }
        fixture.rewind()

        // /notes exists for GET and POST; PATCH matches no registry row, so the
        // kernel's tailcard answers instead of Ktor's bodyless 405/404.
        val response = client.request("/notes") { method = HttpMethod.Patch }

        assertEquals(404, response.status.value)
        assertEquals(
            "route-not-found",
            parser.parseToJsonElement(response.bodyAsText()).jsonObject["code"]?.jsonPrimitive?.content,
        )
    }

    @Test
    fun aBodyThatIsNotJsonIsTheRegisteredValidationProblem() = testApplication {
        val fixture = SliceFixture()
        application { fixture.install(this) }
        fixture.rewind()

        val response = client.post("/notes") {
            contentType(ContentType.Application.Json)
            setBody("{ not json at all")
        }

        assertEquals(400, response.status.value)
        val body = parser.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("validation-failed", body["code"]?.jsonPrimitive?.content)
        assertEquals("body: malformed or missing JSON payload", body["detail"]?.jsonPrimitive?.content)
    }

    @Test
    fun aBodyMissingTheRequiredMemberIsTheSameRejection() = testApplication {
        val fixture = SliceFixture()
        application { fixture.install(this) }
        fixture.rewind()

        val response = client.post("/notes") {
            contentType(ContentType.Application.Json)
            setBody("{}")
        }

        assertEquals(400, response.status.value)
        assertEquals(
            "validation-failed",
            parser.parseToJsonElement(response.bodyAsText()).jsonObject["code"]?.jsonPrimitive?.content,
        )
    }
}
