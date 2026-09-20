import info.solidsoft.gradle.pitest.PitestTask
import org.jetbrains.kotlin.gradle.dsl.ExplicitApiMode
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

// @adr 001 - the pinned stack: JDK 21, Kotlin 2.2.x exact, Ktor 3.x, locked dependencies
// @adr 003 - JaCoCo per-package floors and the PIT mutation floor live HERE, frozen
//
// Every version below is exact (NFR-11): the wrapper is checksum-pinned in
// gradle/wrapper/gradle-wrapper.properties, the plugin and dependency graphs are
// locked in gradle.lockfile (dependencyLocking + `./gradlew dependencies
// --write-locks`), and CI resolves in locked mode. A resolution the lock does not
// name is a failure, not an update.

plugins {
    kotlin("jvm") version "2.2.21"
    kotlin("plugin.serialization") version "2.2.21"
    application
    jacoco
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
    id("info.solidsoft.pitest") version "1.19.0"
}

group = "app"
version = "0.1.0"

// One place per third-party line, so a bump is one reviewed diff.
val ktorVersion = "3.2.4"
val exposedVersion = "1.4.0"

kotlin {
    jvmToolchain(21)
    // NFR-13's Kotlin half: every public declaration states its visibility and its
    // return type, so the API surface of this service is written down rather than
    // inferred. `lint` is the compile, and the compile has teeth.
    explicitApi = ExplicitApiMode.Strict
}

dependencyLocking {
    lockAllConfigurations()
}

repositories {
    mavenCentral()
}

// osv-flagged transitive minimums (the pnpm-workspace.yaml overrides convention,
// restated for Gradle): each pin is the first patched release in the range every
// dependent already accepts, and each carries the advisory that put it here.
// Applied to EVERY configuration on purpose — sec:scan audits `gradle.lockfile`
// whole, and the lock includes tool classpaths (pitest, the Kotlin plugin's own
// signature-verification and swift-export configurations), so a pin that only
// covered `implementation` would leave a scanner finding standing with nothing
// to answer it. Drop a pin once the dependency that brings it catches up.
// Documented in docs/SECURITY.md.
val securityPins = mapOf(
    // Netty arrives through ktor-server-netty and its artifacts move as a set.
    // HIGH GHSA-w9fj-cfpg-grvv / GHSA-prj3-ccx8-p6x4 (http2 DoS batch), plus the
    // handler/transport advisories at the same floor, and MODERATE
    // GHSA-8c42-7qj2-3j46 (netty-codec-http overwrites the CORS Vary header,
    // so a shared cache can serve one origin's response to another) — fixed in
    // 4.2.17.Final, which is why this floor moved off 4.2.16.Final.
    "io.netty" to "4.2.17.Final",
    // MODERATE logback-core advisories reached through logback-classic.
    "ch.qos.logback" to "1.5.34",
    // MODERATE GHSA-rcgg-9c38-7xpx, on the Kotlin plugin's swift-export classpath.
    "io.opentelemetry" to "1.62.0",
    // MODERATE GHSA-cj8j-37rh-8475 and siblings, then CRITICAL GHSA-9pwp-9qqc-pr26
    // (name-constraints bypass via a trailing dot) and HIGH GHSA-qp49-qgx5-5m26
    // (lazy ASN.1 parsing resets the nesting-depth guard) — fixed in 1.85 — on
    // the Kotlin plugin's artifact-signature-verification classpath.
    "org.bouncycastle" to "1.85",
)
// Groups whose artifacts do NOT move as one set are pinned by exact coordinate:
// jackson-annotations tracks a slower version line than core/databind, so a
// group-wide pin would ask Maven Central for a release that does not exist.
val coordinatePins = mapOf(
    // MODERATE GHSA-4265-ccf5-phj5 / GHSA-4g9r-vxhx-9pgx: commons-compress via Testcontainers.
    "org.apache.commons:commons-compress" to "1.26.0",
    // MODERATE GHSA-j288-q9x7-2f5v: uncontrolled recursion in commons-lang3, via the PIT tool classpath.
    "org.apache.commons:commons-lang3" to "3.18.0",
    // Jackson deep-nesting DoS batch; arrives through flyway-core and Testcontainers.
    "com.fasterxml.jackson.core:jackson-core" to "2.21.5",
    "com.fasterxml.jackson.core:jackson-databind" to "2.21.5",
)

configurations.configureEach {
    resolutionStrategy.eachDependency {
        securityPins[requested.group]?.let { useVersion(it) }
        coordinatePins["${requested.group}:${requested.name}"]?.let { useVersion(it) }
    }
}

dependencies {
    // The runtime allowlist (ADR 007): scripts/deps-budget.mjs names exactly these.
    implementation("io.ktor:ktor-server-core:$ktorVersion")
    implementation("io.ktor:ktor-server-netty:$ktorVersion")
    implementation("io.ktor:ktor-server-status-pages:$ktorVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.jetbrains.exposed:exposed-core:$exposedVersion")
    implementation("org.jetbrains.exposed:exposed-jdbc:$exposedVersion")
    implementation("com.zaxxer:HikariCP:7.0.2")
    // flyway-database-postgresql api-exposes flyway-core: one declared decision
    // ("Flyway, for PostgreSQL"), the same way a Spring starter is one decision.
    implementation("org.flywaydb:flyway-database-postgresql:11.14.0")
    runtimeOnly("org.postgresql:postgresql:42.7.12")
    runtimeOnly("ch.qos.logback:logback-classic:1.5.34")

    testImplementation(kotlin("test"))
    testImplementation(platform("org.junit:junit-bom:5.13.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    // Ktor's in-memory test engine: the slices run the real application module
    // over the fixture repository with no socket and no database.
    testImplementation("io.ktor:ktor-server-test-host:$ktorVersion")
    // archunit core, not archunit-junit5: the rules run as plain JUnit tests.
    testImplementation("com.tngtech.archunit:archunit:1.5.0")
    // The real-database tier (ADR 006, BRS §15): Testcontainers Postgres, tagged
    // "native" — tool-gated locally (Docker may be absent), mandatory in CI.
    testImplementation("org.testcontainers:postgresql:1.21.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

application {
    mainClass = "app.MainKt"
}

// `pnpm build` produces the runnable image payload: bin/ + lib/, the exact tree
// the Dockerfile copies. Nothing else in the build writes an artefact that ships.
tasks.assemble {
    dependsOn(tasks.installDist)
}

tasks.withType<KotlinCompile>().configureEach {
    compilerOptions {
        // Warnings are errors so the `lint` gate has teeth beyond detekt's rule set.
        allWarningsAsErrors = true
    }
}

/** Deterministic English messages for validation details and captured examples,
 *  and a pinned timezone (NFR-18): date logic must not pass on one machine's zone
 *  and fail on another's. TimezonePinTest asserts the pin took. */
fun Test.pinnedJvm() {
    systemProperty("user.language", "en")
    systemProperty("user.country", "US")
    systemProperty("user.timezone", "UTC")
    environment("TZ", "UTC")
}

tasks.test {
    // Tag tiers: "native" needs Docker (Testcontainers), "contract" and "capture"
    // are emit/capture writers with their own gradle tasks. Everything else — unit
    // suites and the testApplication conformance replay — runs here, socket-free.
    useJUnitPlatform {
        excludeTags("native", "contract", "capture")
    }
    pinnedJvm()
    finalizedBy(tasks.jacocoTestReport)
}

/** The real-database tier: Flyway migrate plus a catalog read-back against
 *  Testcontainers Postgres. Local machines without Docker skip it (tool-gated,
 *  ADR 006); CI runs it. */
val nativeTest by tasks.registering(Test::class) {
    description = "Persistence tier against a real Postgres via Testcontainers (CI-mandatory)."
    group = "verification"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform { includeTags("native") }
    pinnedJvm()
    shouldRunAfter(tasks.test)
}

// CI runs `nativeTest` after `pnpm verify`, so re-running the report afterwards
// folds the real-engine tier's execution data into the same numbers quality:report
// reads. Locally without Docker the tier does not run and nothing changes.
nativeTest.configure { finalizedBy(tasks.jacocoTestReport) }

/** Emits the raw OpenAPI document from the route registry and the kotlinx
 *  serialization descriptors into build/contract/openapi.raw.json (no socket);
 *  scripts/contract-verify.mjs normalizes, byte-compares and locks it (BR-22). */
val contractEmit by tasks.registering(Test::class) {
    description = "Emit the OpenAPI contract from the route registry (BR-22)."
    group = "contract"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform { includeTags("contract") }
    pinnedJvm()
    outputs.upToDateWhen { false }
}

/** Replays the harness scenarios through the test application and writes
 *  byte-stable example JSONs into docs/api/<operationId>/examples/ (BR-26). */
val exampleCapture by tasks.registering(Test::class) {
    description = "Capture docs/api examples from the harness scenarios (BR-26)."
    group = "documentation"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform { includeTags("capture") }
    pinnedJvm()
    outputs.upToDateWhen { false }
}

/** The e2e conformance run as its own task, spawned by scripts/e2e-conformance.mjs. */
val conformance by tasks.registering(Test::class) {
    description = "Replay every harness scenario against the test application (test:e2e)."
    group = "verification"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform { includeTags("conformance") }
    pinnedJvm()
    // BR-36: the runner's own "conformance: N scenarios green" line must reach
    // scripts/e2e-conformance.mjs, which records it into .proto-forge/e2e-results.json.
    testLogging { showStandardStreams = true }
    outputs.upToDateWhen { false }
}

/** Operator migration runner (ADR 006): DATABASE_URL=jdbc:postgresql://… ./gradlew dbMigrate */
val dbMigrate by tasks.registering(JavaExec::class) {
    description = "Apply src/main/resources/db/migration to DATABASE_URL (operator tool)."
    group = "database"
    mainClass = "app.MigrateMainKt"
    classpath = sourceSets.main.get().runtimeClasspath
}

detekt {
    buildUponDefaultConfig = true
    allRules = false
    config.setFrom(files("config/detekt.yml"))
    basePath = rootDir.absolutePath
}

tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
    jvmTarget = "21"
    reports {
        xml.required = false
        html.required = false
        txt.required = false
        sarif.required = false
        md.required = false
    }
}

jacoco {
    toolVersion = "0.8.13"
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    // The persistence adapter's only honest oracle is a real engine, so its
    // execution data comes from the native tier. Both .exec files feed one report
    // WHEN the native tier has run (CI always; locally wherever Docker exists) —
    // so the reported number is "what the suites actually proved", never a
    // percentage flattered by leaving the Docker-gated tier out of the sum.
    executionData(
        fileTree(layout.buildDirectory).include("jacoco/test.exec", "jacoco/nativeTest.exec"),
    )
    reports {
        xml.required = true
        html.required = true
    }
}

// LOCKED by scripts/coverage-policy.mjs: every rule below must keep its 1.00 floors
// on app.domain + app.application + app.config, and every exclusion must be on the gate's
// allow-list with the reason stated on the line above. A new kind of exclusion is a
// gate edit and an ADR, not a build tweak (BRS §3.1).
tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.test)
    violationRules {
        // 100 on the behavioural core: domain and application carry the product
        // logic, and a floor below 100 there is a standing licence for untested
        // branches exactly where the code changes most (ADR 003). app.config joins
        // them because it reached 100 on its own and a settings reader is exactly
        // the kind of code whose untested branch is discovered in production.
        rule {
            element = "PACKAGE"
            includes = listOf(
                "app.domain", "app.domain.*",
                "app.application", "app.application.*",
                "app.config", "app.config.*",
            )
            limit {
                counter = "INSTRUCTION"
                value = "COVEREDRATIO"
                minimum = "1.00".toBigDecimal()
            }
            limit {
                counter = "BRANCH"
                value = "COVEREDRATIO"
                minimum = "1.00".toBigDecimal()
            }
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "1.00".toBigDecimal()
            }
        }
    }
    classDirectories.setFrom(
        sourceSets.main.get().output.asFileTree.matching {
            // coverageExcludes (allow-listed in scripts/coverage-policy.mjs):
            exclude(
                // bootstrap entries: the composition root and the operator migration
                // runner open sockets, covered by the conformance run
                "app/MainKt*",
                "app/MigrateMainKt*",
                "app/WiringKt*",
            )
        }
    )
}

tasks.check {
    dependsOn(tasks.jacocoTestCoverageVerification)
}

pitest {
    // NFR-14: the JVM floor is 85, ratchet-only, frozen by the guard hook. The
    // mutated scope is the behavioural core — domain + application — mirroring
    // api-node's Stryker scope (ADR 003).
    pitestVersion = "1.20.3"
    junit5PluginVersion = "1.2.3"
    targetClasses = setOf("app.domain.*", "app.application.*", "app.config.*")
    targetTests = setOf("app.domain.*", "app.application.*", "app.config.*")
    // PIT's defaults plus the Kotlin compiler's null-check intrinsics. This is not
    // a narrowed scope — every class above is still mutated — it stops the
    // VOID_METHOD_CALLS mutator from deleting `Intrinsics.checkNotNullExpressionValue`
    // calls the compiler inserts on platform-type boundaries. Those mutants are
    // unkillable by construction in Kotlin-only code (no test can make a Kotlin
    // non-null expression null), so leaving them in would measure the compiler and
    // then blame the suite for it. Measured both ways, and the reason is on the
    // record: ADR 003. Raw run: 22/29 killed (76%), the 7 survivors ALL this one
    // intrinsic. With the intrinsic excluded: the number below.
    avoidCallsTo = setOf(
        "kotlin.jvm.internal.Intrinsics",
        "java.util.logging",
        "org.apache.log4j",
        "org.slf4j",
        "org.apache.commons.logging",
    )
    mutationThreshold = 85
    threads = 4
    timestampedReports = false
    failWhenNoMutations = true
    outputFormats = setOf("XML", "HTML")
}

tasks.withType<PitestTask> {
    // PIT drives the unit suites only; the tagged tiers have their own oracles.
    // The same determinism pins as pinnedJvm(): PIT spawns its own JVMs, and
    // user.timezone is the pin a JVM reads (no Test.environment here — PitestTask
    // is not a Test task).
    systemProperty("user.language", "en")
    systemProperty("user.country", "US")
    systemProperty("user.timezone", "UTC")
}
