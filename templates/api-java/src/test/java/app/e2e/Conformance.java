package app.e2e;

import app.adapter.in.web.RouteDef;
import app.adapter.in.web.RouteRegistry;
import app.harness.HarnessCase;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.List;

// The assertion half of the conformance run: status, problem codes and response
// shapes are held to the registry's own declarations (BR-25/BR-26) - a scenario
// expecting a status its operation does not declare is a harness bug, failed loudly.
public final class Conformance {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  public static List<String> check(HarnessCase harnessCase, int status, String body) throws Exception {
    if (status != harnessCase.expectStatus()) {
      return List.of(harnessCase.id() + ": expected status " + harnessCase.expectStatus()
          + ", got " + status + " (body: " + body + ")");
    }
    if (harnessCase.expectProblem() != null) {
      return checkProblemBody(harnessCase, body);
    }
    return checkSuccessBody(harnessCase, body);
  }

  private static List<String> checkProblemBody(HarnessCase harnessCase, String body) throws Exception {
    JsonNode parsed = MAPPER.readTree(body);
    String code = parsed.path("code").asText(null);
    if (!harnessCase.expectProblem().equals(code)) {
      return List.of(harnessCase.id() + ": expected problem code \"" + harnessCase.expectProblem()
          + "\", got " + code);
    }
    return List.of();
  }

  private static List<String> checkSuccessBody(HarnessCase harnessCase, String body) throws Exception {
    RouteDef.ResponseShape shape = successShape(harnessCase);
    if (shape.type() == null) {
      return body.isEmpty()
          ? List.of()
          : List.of(harnessCase.id() + ": expected an empty body, got " + body);
    }
    JsonNode parsed = MAPPER.readTree(body);
    List<String> failures = new ArrayList<>();
    if (shape.array()) {
      if (!parsed.isArray()) {
        return List.of(harnessCase.id() + ": expected a JSON array, got " + body);
      }
      for (JsonNode element : parsed) {
        failures.addAll(checkShape(harnessCase.id(), element, shape.type()));
      }
    } else {
      failures.addAll(checkShape(harnessCase.id(), parsed, shape.type()));
    }
    return failures;
  }

  /** The record's components ARE the response schema (§12.2): exact field set, no extras. */
  private static List<String> checkShape(String caseId, JsonNode node, Class<?> type) {
    List<String> failures = new ArrayList<>();
    RecordComponent[] components = type.getRecordComponents();
    for (RecordComponent component : components) {
      if (!node.has(component.getName())) {
        failures.add(caseId + ": response body misses the " + type.getSimpleName()
            + " field \"" + component.getName() + "\"");
      }
    }
    int expected = components.length;
    if (node.size() != expected) {
      failures.add(caseId + ": response body carries " + node.size() + " fields, the "
          + type.getSimpleName() + " schema declares " + expected);
    }
    return failures;
  }

  private static RouteDef.ResponseShape successShape(HarnessCase harnessCase) {
    RouteDef route = RouteRegistry.ROUTES.stream()
        .filter(def -> def.operationId().equals(harnessCase.operationId()))
        .findFirst()
        .orElseThrow(() -> new IllegalStateException(
            "case \"" + harnessCase.id() + "\" names unknown operation \"" + harnessCase.operationId() + "\""));
    RouteDef.ResponseShape shape = route.responseByStatus().get(harnessCase.expectStatus());
    if (shape == null) {
      throw new IllegalStateException("case \"" + harnessCase.id() + "\" expects status "
          + harnessCase.expectStatus() + ", which \"" + harnessCase.operationId() + "\" does not declare");
    }
    return shape;
  }

  private Conformance() {}
}
