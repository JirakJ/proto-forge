package slices

import app.SERVICE_VERSION
import app.adapters.`in`.http.RouteRegistry
import app.e2e.CanonicalJson
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.jupiter.api.Tag

// @adr 008 - the committed contract is emitted, never edited (BR-22)
//
// The emit half of `./gradlew contractEmit`: the emitter derives the document
// from the route registry and the domain descriptors - no socket, no database,
// no running server - and this test writes it to build/contract/openapi.raw.json.
// scripts/contract-verify.mjs then normalizes it (shared normalizer: sorted keys,
// volatile members stripped) and byte-compares against contract/openapi.json.
class ContractEmitTest {

    @Test
    @Tag("contract")
    fun emitsTheRawOpenApiDocument() {
        val document = OpenApiEmitter.emit(RouteRegistry.ROUTES, "proto-forge-service", SERVICE_VERSION)
        val out = Path.of("build", "contract", "openapi.raw.json")
        Files.createDirectories(out.parent)
        Files.writeString(out, CanonicalJson.write(document))
    }

    @Test
    fun theEmissionIsDeterministic() {
        val first = CanonicalJson.write(OpenApiEmitter.emit(RouteRegistry.ROUTES, "proto-forge-service", SERVICE_VERSION))
        val second = CanonicalJson.write(OpenApiEmitter.emit(RouteRegistry.ROUTES, "proto-forge-service", SERVICE_VERSION))
        assertEquals(first, second, "the emitter must be a pure function of the registry (BR-22)")
    }
}
