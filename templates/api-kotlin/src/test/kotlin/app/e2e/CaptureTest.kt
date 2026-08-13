package app.e2e

import app.harness.HarnessCase
import app.harness.HarnessCases
import io.ktor.server.testing.testApplication
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Tag
import slices.SliceFixture

// Docs example capture (BR-26): replays the harness scenarios and writes each
// exchange to docs/api/<operationId>/examples/<case-id>.json. Same pinned clock
// and ids as the conformance run, so reruns are byte-identical. Run through
// `./gradlew exampleCapture` (pnpm docs:examples re-pins the lock afterwards).
class CaptureTest {

    private val parser = Json { ignoreUnknownKeys = true }

    @Test
    @Tag("capture")
    fun capturesEveryHarnessScenario() = testApplication {
        val fixture = SliceFixture()
        application { fixture.install(this) }
        fixture.rewind()

        for (harnessCase in HarnessCases.CASES) {
            val exchange = replay(harnessCase)
            val directory = Path.of("docs", "api", harnessCase.operationId, "examples")
            Files.createDirectories(directory)
            Files.writeString(
                directory.resolve("${harnessCase.id}.json"),
                CanonicalJson.write(example(harnessCase, exchange)),
            )
        }
    }

    private fun example(harnessCase: HarnessCase, exchange: Exchange): JsonObject = buildJsonObject {
        put(
            "request",
            buildJsonObject {
                put("method", harnessCase.method)
                put("path", harnessCase.path)
                if (harnessCase.body != null) {
                    put("body", parser.parseToJsonElement(harnessCase.body))
                }
            },
        )
        put(
            "response",
            buildJsonObject {
                put("status", exchange.status)
                put("headers", buildJsonObject { put("content-type", exchange.contentType) })
                put(
                    "body",
                    if (exchange.body.isEmpty()) JsonNull else parser.parseToJsonElement(exchange.body),
                )
            },
        )
    }
}
