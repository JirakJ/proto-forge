import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync, execSync } from "node:child_process";
import { fail, ok, note } from "./lib.mjs";

// @adr 003 - gates:selftest Tier 2: the NATIVE halves get a demonstrated failure too
//
// Tier 1 proves every .mjs gate on fixture directories. The claims the JVM
// toolchain enforces — ArchUnit rejects an illegal import, the JaCoCo rule
// rejects an uncovered branch, flyway validate rejects a drifted migration —
// need a real Gradle build to fail, so this tier builds THROWAWAY Gradle
// projects (driven by this template's own checksum-pinned wrapper via `-p`) and
// asserts the exit codes. CI-only by placement (minutes, not seconds — the
// verify-template precedent, BRS §18/§19); the flyway case additionally needs
// Docker and is tool-gated locally exactly like the native test tier.

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const GRADLEW = join(ROOT, "gradlew");
const results = [];

const SETTINGS = 'rootProject.name = "native-fixture"\n';
const BUILD_COMMON = `plugins {
    java
    jacoco
}
java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }
repositories { mavenCentral() }
dependencies {
    testImplementation(platform("org.junit:junit-bom:5.12.2"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
%EXTRA_DEPS%
}
tasks.test { useJUnitPlatform() }
%EXTRA_TASKS%
`;

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "proto-forge-native-"));
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

function gradle(dir, args) {
  const r = spawnSync(GRADLEW, ["-p", dir, "--console=plain", "-q", ...args], {
    encoding: "utf8",
    env: process.env,
    timeout: 15 * 60 * 1000,
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function expectBuild(name, files, args, { pass, matching }) {
  const dir = project(files);
  try {
    const { code, out } = gradle(dir, args);
    const passed = code === 0;
    if (passed !== pass) {
      results.push(`${name}: expected ${pass ? "PASS" : "FAIL"}, got ${passed ? "PASS" : "FAIL"} — ${out.trim().slice(-800)}`);
    } else if (matching !== undefined && !matching.test(out) && !reportsMatch(dir, matching)) {
      results.push(`${name}: correct verdict but neither output nor test report mentions ${matching}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function reportsMatch(dir, matching) {
  const reports = join(dir, "build", "test-results", "test");
  if (!existsSync(reports)) return false;
  try {
    for (const file of execSync(`ls ${reports}`, { encoding: "utf8" }).split("\n")) {
      if (file.endsWith(".xml") && matching.test(readFileSync(join(reports, file), "utf8"))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

const build = (extraDeps = "", extraTasks = "") =>
  BUILD_COMMON.replace("%EXTRA_DEPS%", extraDeps).replace("%EXTRA_TASKS%", extraTasks);

// --- 1. ArchUnit fires: an illegal domain import fails the JVM build -----------
expectBuild(
  "native-arch: a domain class importing a forbidden package fails the ArchUnit suite",
  {
    "settings.gradle.kts": SETTINGS,
    "build.gradle.kts": build('    testImplementation("com.tngtech.archunit:archunit:1.5.0")'),
    "src/main/java/fixture/domain/Bad.java":
      "package fixture.domain;\n\nimport java.sql.Connection;\n\npublic final class Bad {\n  Connection connection;\n}\n",
    "src/test/java/fixture/ArchTest.java": `package fixture;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

class ArchTest {
  @Test
  void domainIsFrameworkFree() {
    noClasses().that().resideInAPackage("fixture.domain..")
        .should().dependOnClassesThat().resideInAnyPackage("java.sql..")
        .check(new ClassFileImporter().importPackages("fixture"));
  }
}
`,
  },
  ["test"],
  { pass: false, matching: /Architecture Violation|java\.sql/ },
);

// --- 2. the JaCoCo rule fires: an uncovered branch fails the verification -----
expectBuild(
  "native-jacoco: an uncovered branch fails the 1.00 verification rule",
  {
    "settings.gradle.kts": SETTINGS,
    "build.gradle.kts": build(
      "",
      `tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.test)
    violationRules {
        rule {
            element = "PACKAGE"
            includes = listOf("fixture", "fixture.*")
            limit { counter = "BRANCH"; value = "COVEREDRATIO"; minimum = "1.00".toBigDecimal() }
        }
    }
}
`,
    ),
    "src/main/java/fixture/Half.java":
      "package fixture;\n\npublic final class Half {\n  public static int f(boolean flag) {\n    return flag ? 1 : 2;\n  }\n}\n",
    "src/test/java/fixture/HalfTest.java": `package fixture;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class HalfTest {
  @Test
  void coversOnlyOneSide() {
    assertEquals(1, Half.f(true));
  }
}
`,
  },
  ["jacocoTestCoverageVerification"],
  { pass: false, matching: /Rule violated|jacocoTestCoverageVerification/ },
);

// --- 3. flyway validate fires: a drifted migration fails against a real engine -
// Needs Docker (a real Postgres, BRS §15). Tool-gated locally; mandatory in CI.
const dockerReady = (() => {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

if (!dockerReady && !process.env.CI) {
  note("native-flyway: Docker not available — skipping locally (CI runs this tier with Docker)");
} else if (!dockerReady && process.env.CI) {
  results.push("native-flyway: Docker not available in CI — the real-engine tier is mandatory there");
} else {
  expectBuild(
    "native-flyway: a migration whose bytes drifted after being applied fails flyway validate",
    {
      "settings.gradle.kts": SETTINGS,
      "build.gradle.kts": build(
        `    testImplementation("org.flywaydb:flyway-core:11.7.2")
    testImplementation("org.flywaydb:flyway-database-postgresql:11.7.2")
    testImplementation("org.testcontainers:postgresql:1.21.4")
    testRuntimeOnly("org.postgresql:postgresql:42.7.12")`,
      ),
      "applied/V0001__notes.sql": "CREATE TABLE notes (id uuid PRIMARY KEY, text text NOT NULL);\n",
      "drifted/V0001__notes.sql": "CREATE TABLE notes (id uuid PRIMARY KEY, text text);\n",
      "src/test/java/fixture/FlywayValidateTest.java": `package fixture;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

class FlywayValidateTest {
  @Test
  void validateRejectsADriftedMigration() {
    try (PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")) {
      postgres.start();
      Flyway.configure()
          .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
          .locations("filesystem:applied")
          .load()
          .migrate();
      // The same version, different bytes: the history changed under the database.
      Flyway.configure()
          .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
          .locations("filesystem:drifted")
          .load()
          .validate();
    }
  }
}
`,
    },
    ["test"],
    { pass: false, matching: /Validate failed|checksum mismatch|FlywayValidateException/i },
  );
}

if (results.length) fail(`gates:selftest:native FAILED (${results.length})`, results);
ok("gates:selftest:native: ArchUnit, the JaCoCo rule and flyway validate each reject what they claim to reject");
