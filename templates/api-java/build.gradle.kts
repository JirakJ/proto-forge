import info.solidsoft.gradle.pitest.PitestTask

// @adr 001 - the pinned stack: JDK 21, Spring Boot 3.5.x exact, locked dependencies
// @adr 003 - JaCoCo per-package floors and the PIT mutation floor live HERE, frozen
//
// Every version below is exact (NFR-11): the wrapper is checksum-pinned in
// gradle/wrapper/gradle-wrapper.properties, the plugin and dependency graphs are
// locked in gradle.lockfile (dependencyLocking + `./gradlew dependencies
// --write-locks`), and CI resolves in locked mode. A resolution the lock does not
// name is a failure, not an update.

plugins {
    java
    jacoco
    id("org.springframework.boot") version "3.5.16"
    id("io.spring.dependency-management") version "1.1.7"
    id("info.solidsoft.pitest") version "1.19.0"
}

group = "app"
version = "0.1.0"

// osv-flagged transitive minimums (the pnpm-workspace.yaml overrides convention,
// restated for the Boot BOM): each pin is the first patched release in the range
// every dependent already accepts. BOM-managed artifacts move via these version
// properties (a plain constraint loses to io.spring.dependency-management); drop
// a pin once the managing BOM catches up. Documented in docs/SECURITY.md.
// HIGH GHSA-j92g-9f8w-j867: channel-binding downgrade in the pgjdbc driver.
extra["postgresql.version"] = "42.7.12"
// Three MODERATE advisories against jackson-databind 2.21.4 (deep-nesting DoS batch).
extra["jackson-bom.version"] = "2.22.1"
// MODERATE GHSA-j288-q9x7-2f5v: uncontrolled recursion in commons-lang3 — reached
// through the test classpath AND the PIT tool configuration.
extra["commons-lang3.version"] = "3.18.0"
// MODERATE GHSA-qv9r-c865-cp47: improper encoding of non-finite floats in
// log4j-api's MapMessage. It arrives through spring-boot-starter-logging's
// log4j-to-slf4j bridge, so the app never calls it — pinned anyway, because an
// advisory a scanner can see is one a reviewer has to answer for.
extra["log4j2.version"] = "2.25.5"
// CRITICAL GHSA-9xv2-5v5q-p794, GHSA-gcx9-497g-6cp6 and
// GHSA-h3x4-894j-xpx5: Tomcat authentication and request-processing flaws.
extra["tomcat.version"] = "10.1.58"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

dependencyLocking {
    lockAllConfigurations()
}

repositories {
    mavenCentral()
}

dependencies {
    // The runtime allowlist (ADR 007): scripts/deps-budget.mjs names exactly these.
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    // springdoc is TEST-slice only (ADR 008): the contract is emitted by the
    // contractEmit test slice, never served by the running application.
    testImplementation("org.springdoc:springdoc-openapi-starter-webmvc-api:2.8.17")
    // archunit core, not archunit-junit5: the rules run as plain JUnit tests, and
    // the junit5 artifact would drag a junit-platform newer than Boot manages.
    testImplementation("com.tngtech.archunit:archunit:1.5.0")
    // The real-database tier (ADR 006, BRS §15): Testcontainers Postgres, tagged
    // "native" — tool-gated locally (Docker may be absent), mandatory in CI.
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:postgresql")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    // The non-BOM-managed half of the osv pins (the BOM-managed ones sit in the
    // extra["…version"] overrides above):
    constraints {
        // MODERATE GHSA-4g9r-vg56-wxx5 / GHSA-4265-ccf5-phj5: commons-compress via Testcontainers.
        testImplementation("org.apache.commons:commons-compress:1.26.0")
    }
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    // -parameters keeps @PathVariable names resolvable; warnings are errors so the
    // `lint` gate has teeth without a second linter dependency.
    options.compilerArgs.addAll(listOf("-parameters", "-Xlint:all,-processing,-serial", "-Werror"))
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
    // suites and the MockMvc conformance replay — runs here, socket-free.
    useJUnitPlatform {
        excludeTags("native", "contract", "capture")
    }
    pinnedJvm()
    finalizedBy(tasks.jacocoTestReport)
}

/** The real-database tier: Flyway migrate + ddl-auto=validate against Testcontainers
 *  Postgres. Local machines without Docker skip it (tool-gated, ADR 006); CI runs it. */
val nativeTest by tasks.registering(Test::class) {
    description = "Persistence tier against a real Postgres via Testcontainers (CI-mandatory)."
    group = "verification"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform { includeTags("native") }
    pinnedJvm()
    shouldRunAfter(tasks.test)
}

/** Emits the raw OpenAPI document from the springdoc test slice (MockMvc, no socket)
 *  into build/contract/openapi.raw.json; scripts/contract-verify.mjs normalizes,
 *  byte-compares and locks it (BR-22). */
val contractEmit by tasks.registering(Test::class) {
    description = "Emit the OpenAPI contract from the springdoc test slice (BR-22)."
    group = "contract"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform { includeTags("contract") }
    pinnedJvm()
    outputs.upToDateWhen { false }
}

/** Replays the harness scenarios through MockMvc and writes byte-stable example
 *  JSONs into docs/api/<operationId>/examples/ (BR-26). */
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
    description = "Replay every harness scenario against the MockMvc slice (test:e2e)."
    group = "verification"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform {
        includeTags("conformance")
    }
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
    mainClass = "app.MigrateMain"
    classpath = sourceSets.main.get().runtimeClasspath
}

jacoco {
    toolVersion = "0.8.13"
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        xml.required = true
        html.required = true
    }
}

// LOCKED by scripts/coverage-policy.mjs: every rule below must keep its 1.00 floors
// on app.domain + app.application, and every exclusion must be on the gate's
// allow-list with the reason stated on the line above. A new kind of exclusion is a
// gate edit and an ADR, not a build tweak (BRS §3.1).
tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.test)
    violationRules {
        // 100 on the behavioural core: domain and application carry the product
        // logic, and a floor below 100 there is a standing licence for untested
        // branches exactly where the code changes most (ADR 003).
        rule {
            element = "PACKAGE"
            includes = listOf("app.domain", "app.domain.*", "app.application", "app.application.*")
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
                "app/Application*",
                "app/MigrateMain*",
                "app/Wiring*",
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
    targetClasses = setOf("app.domain.*", "app.application.*")
    targetTests = setOf("app.domain.*", "app.application.*")
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
