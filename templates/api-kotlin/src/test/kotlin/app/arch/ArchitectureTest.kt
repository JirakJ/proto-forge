package app.arch

import com.tngtech.archunit.core.domain.JavaClasses
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// @adr 005 - the architecture profile is an ArchUnit rule set, selected by derivation
//
// arch:verify re-derives the style from .proto-forge/facets.json and fails when
// the ACTIVE profile here disagrees (BR-21). The three profiles share one element
// vocabulary; what changes is which dependency edges are legal. The active edge
// table is selected FROM .proto-forge/architecture.json - data-driven, never
// hardcoded - and arch:verify re-proves the same edges with its own standalone
// import scan, so BR-21 does not depend on the JVM being present.
class ArchitectureTest {

    // Which element types each element may depend on. The domain is framework-pure
    // in EVERY profile; the profiles differ in whether adapters may lean on each other.
    private val edges: Map<String, Map<String, List<String>>> = mapOf(
        "layered" to mapOf(
            "domain" to listOf("domain"),
            "application" to listOf("application", "domain", "platform"),
            "adapter-in" to listOf("adapter-in", "application", "domain", "platform", "config"),
            "adapter-out" to listOf("adapter-out", "application", "domain", "platform", "config"),
        ),
        "modular" to mapOf(
            "domain" to listOf("domain"),
            "application" to listOf("application", "domain", "platform"),
            "adapter-in" to listOf("adapter-in", "application", "domain", "platform", "config"),
            "adapter-out" to listOf("adapter-out", "application", "domain", "platform", "config"),
        ),
        "hexagonal" to mapOf(
            "domain" to listOf("domain"),
            "application" to listOf("application", "domain", "platform"),
            // Strict profile: an inbound adapter may not depend on an outbound one
            // or vice versa - everything crosses through the application's ports.
            "adapter-in" to listOf("adapter-in", "application", "domain", "platform", "config"),
            "adapter-out" to listOf("adapter-out", "application", "domain", "platform", "config"),
        ),
    )

    // In the hexagonal profile the OTHER adapter side is forbidden; the shared rows
    // above keep each side's own package legal in every profile.
    private val hexagonalForbidden: Map<String, List<String>> = mapOf(
        "adapter-in" to listOf("adapter-out"),
        "adapter-out" to listOf("adapter-in"),
    )

    private val packages: Map<String, String> = mapOf(
        "domain" to "app.domain..",
        "application" to "app.application..",
        "adapter-in" to "app.adapters.in..",
        "adapter-out" to "app.adapters.out..",
        "platform" to "app.platform..",
        "config" to "app.config..",
    )

    // Which external packages each element may see (BR-21). kotlinx.serialization is
    // a codec and a descriptor model, not a framework - the annotations ARE the
    // schema (§12.2); the platform kernel owns the framework-integration surface
    // (problem pages, security headers, health) per BRS §16, and it is byte-pinned.
    // org.jetbrains.annotations rides along in every element: the Kotlin compiler
    // stamps @NotNull/@Nullable onto JVM signatures, so it is bytecode furniture
    // rather than a dependency anybody chose.
    private val allowedExternals: Map<String, List<String>> = mapOf(
        "domain" to listOf("java..", "kotlin..", "kotlinx.serialization.."),
        "application" to listOf("java..", "kotlin.."),
        "platform" to listOf("java..", "kotlin..", "kotlinx..", "io.ktor..", "org.slf4j.."),
        "config" to listOf("java..", "kotlin.."),
    )

    private val compilerFurniture = listOf("org.jetbrains.annotations..")

    private val classes: JavaClasses = ClassFileImporter()
        .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
        .importPackages("app")

    private fun derivedStyle(): String =
        Json.parseToJsonElement(Files.readString(Path.of(".proto-forge/architecture.json")))
            .jsonObject
            .getValue("style")
            .jsonPrimitive
            .content

    @Test
    fun theRecordedStyleIsAKnownProfile() {
        assertTrue(
            edges.containsKey(derivedStyle()),
            ".proto-forge/architecture.json names unknown style \"${derivedStyle()}\"",
        )
    }

    @Test
    fun innerElementsSeeOnlyTheirAllowedWorld() {
        val style = derivedStyle()
        val table = edges.getValue(style)
        for (element in listOf("domain", "application", "platform", "config")) {
            val allowed = buildList {
                addAll(allowedExternals.getValue(element))
                addAll(compilerFurniture)
                addAll(table.getOrElse(element) { listOf(element) }.map { packages.getValue(it) })
                add(packages.getValue(element))
            }
            classes().that().resideInAPackage(packages.getValue(element))
                .should().onlyDependOnClassesThat().resideInAnyPackage(*allowed.toTypedArray())
                .because("the \"$style\" profile pins $element's world (BR-21)")
                .check(classes)
        }
    }

    @Test
    fun adaptersNeverReachTheOtherAdaptersInternalsUnderHexagonal() {
        val style = derivedStyle()
        if (style != "hexagonal") {
            return
        }
        for ((element, forbiddenElements) in hexagonalForbidden) {
            val forbidden = forbiddenElements.map { packages.getValue(it) }.toTypedArray()
            noClasses().that().resideInAPackage(packages.getValue(element))
                .should().dependOnClassesThat().resideInAnyPackage(*forbidden)
                .because("hexagonal adapters cross only through the application's ports (BR-21)")
                .check(classes)
        }
    }

    @Test
    fun adaptersDependInwardOnly() {
        val style = derivedStyle()
        val table = edges.getValue(style)
        for (element in listOf("adapter-in", "adapter-out")) {
            val allowed = table.getValue(element)
            val forbidden = packages.keys
                .filter { it !in allowed && it != element }
                .map { packages.getValue(it) }
                .toTypedArray()
            if (forbidden.isEmpty()) {
                continue
            }
            noClasses().that().resideInAPackage(packages.getValue(element))
                .should().dependOnClassesThat().resideInAnyPackage(*forbidden)
                .because("the \"$style\" profile does not allow that edge (BR-21)")
                .check(classes)
        }
    }
}
