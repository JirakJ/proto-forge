package app.arch;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertTrue;

import tools.jackson.databind.ObjectMapper;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

// @adr 005 - the architecture profile is an ArchUnit rule set, selected by derivation
//
// arch:verify re-derives the style from .proto-forge/facets.json and fails when
// the ACTIVE profile here disagrees (BR-21). The three profiles share one element
// vocabulary; what changes is which dependency edges are legal. The active edge
// table is selected FROM .proto-forge/architecture.json - data-driven, never
// hardcoded - and arch:verify re-proves the same edges with its own standalone
// import scan, so BR-21 does not depend on the JVM being present.
class ArchitectureTest {

  // Which element types each element may depend on. The domain is framework-pure in
  // EVERY profile; the profiles differ in whether adapters may lean on each other.
  private static final Map<String, Map<String, List<String>>> EDGES = Map.of(
      "layered", Map.of(
          "domain", List.of("domain"),
          "application", List.of("application", "domain", "platform"),
          "adapter-in", List.of("adapter-in", "application", "domain", "platform", "config"),
          "adapter-out", List.of("adapter-out", "application", "domain", "platform", "config")),
      "modular", Map.of(
          "domain", List.of("domain"),
          "application", List.of("application", "domain", "platform"),
          "adapter-in", List.of("adapter-in", "application", "domain", "platform", "config"),
          "adapter-out", List.of("adapter-out", "application", "domain", "platform", "config")),
      "hexagonal", Map.of(
          "domain", List.of("domain"),
          "application", List.of("application", "domain", "platform"),
          // Strict profile: an inbound adapter may not depend on an outbound one or
          // vice versa - everything crosses through the application's ports.
          "adapter-in", List.of("adapter-in", "application", "domain", "platform", "config"),
          "adapter-out", List.of("adapter-out", "application", "domain", "platform", "config")));

  // In the hexagonal profile the OTHER adapter side is forbidden; the shared rows
  // above keep each side's own package legal in every profile.
  private static final Map<String, List<String>> HEXAGONAL_FORBIDDEN = Map.of(
      "adapter-in", List.of("adapter-out"),
      "adapter-out", List.of("adapter-in"));

  private static final Map<String, String> PACKAGES = Map.of(
      "domain", "app.domain..",
      "application", "app.application..",
      "adapter-in", "app.adapter.in..",
      "adapter-out", "app.adapter.out..",
      "platform", "app.platform..",
      "config", "app.config..");

  // Which external packages each element may see (BR-21). jakarta.validation is
  // spec-only and I/O-free - the constraints ARE the schema (§12.2); the platform
  // kernel owns the framework-integration surface (advice, filter, health) per
  // BRS §16, and it is byte-pinned.
  private static final Map<String, List<String>> ALLOWED_EXTERNALS = Map.of(
      "domain", List.of("java..", "jakarta.validation.."),
      "application", List.of("java..", "jakarta.validation.."),
      "platform", List.of("java..", "jakarta..", "org.slf4j..", "org.springframework.."),
      "config", List.of("java..", "jakarta..", "org.springframework.."));

  private static final JavaClasses CLASSES = new ClassFileImporter()
      .withImportOption(new ImportOption.DoNotIncludeTests())
      .importPackages("app");

  private static String derivedStyle() throws IOException {
    return new ObjectMapper()
        .readTree(Path.of(".proto-forge/architecture.json").toFile())
        .get("style")
        .asString();
  }

  @Test
  void theRecordedStyleIsAKnownProfile() throws IOException {
    assertTrue(EDGES.containsKey(derivedStyle()),
        ".proto-forge/architecture.json names unknown style \"" + derivedStyle() + "\"");
  }

  @Test
  void innerElementsSeeOnlyTheirAllowedWorld() throws IOException {
    Map<String, List<String>> edges = EDGES.get(derivedStyle());
    for (String element : List.of("domain", "application", "platform", "config")) {
      List<String> allowed = new ArrayList<>(ALLOWED_EXTERNALS.get(element));
      for (String target : edges.getOrDefault(element, List.of(element))) {
        allowed.add(PACKAGES.get(target));
      }
      allowed.add(PACKAGES.get(element));
      classes().that().resideInAPackage(PACKAGES.get(element))
          .should().onlyDependOnClassesThat().resideInAnyPackage(allowed.toArray(String[]::new))
          .because("the \"" + derivedStyle() + "\" profile pins " + element + "'s world (BR-21)")
          .check(CLASSES);
    }
  }

  @Test
  void adaptersNeverReachTheOtherAdaptersInternalsUnderHexagonal() throws IOException {
    if (!"hexagonal".equals(derivedStyle())) {
      return;
    }
    for (Map.Entry<String, List<String>> entry : HEXAGONAL_FORBIDDEN.entrySet()) {
      String[] forbidden = entry.getValue().stream().map(PACKAGES::get).toArray(String[]::new);
      noClasses().that().resideInAPackage(PACKAGES.get(entry.getKey()))
          .should().dependOnClassesThat().resideInAnyPackage(forbidden)
          .because("hexagonal adapters cross only through the application's ports (BR-21)")
          .check(CLASSES);
    }
  }

  @Test
  void adaptersDependInwardOnly() throws IOException {
    Map<String, List<String>> edges = EDGES.get(derivedStyle());
    for (String element : List.of("adapter-in", "adapter-out")) {
      List<String> allowed = edges.get(element);
      String[] forbidden = PACKAGES.keySet().stream()
          .filter(candidate -> !allowed.contains(candidate) && !candidate.equals(element))
          .map(PACKAGES::get)
          .toArray(String[]::new);
      if (forbidden.length == 0) {
        continue;
      }
      noClasses().that().resideInAPackage(PACKAGES.get(element))
          .should().dependOnClassesThat().resideInAnyPackage(forbidden)
          .because("the \"" + derivedStyle() + "\" profile does not allow that edge (BR-21)")
          .check(CLASSES);
    }
  }
}
