package app.e2e

import app.harness.HarnessCase
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder

/**
 * One way to execute a harness case, shared by the conformance run and the
 * capture. Ktor's test client speaks to the in-memory engine, so no socket is
 * ever opened and the replay is identical on every machine.
 */
suspend fun ApplicationTestBuilder.replay(harnessCase: HarnessCase): Exchange {
    val response = client.request(harnessCase.path) {
        method = HttpMethod.parse(harnessCase.method)
        if (harnessCase.body != null) {
            contentType(ContentType.Application.Json)
            setBody(harnessCase.body)
        }
    }
    return Exchange(
        status = response.status.value,
        contentType = response.headers[HttpHeaders.ContentType].orEmpty(),
        body = response.bodyAsText(),
    )
}
