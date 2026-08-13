package app.harness;

/**
 * One scenario: an operation crossed with an outcome. PURE DATA - the e2e
 * conformance runner replays these against the MockMvc slice and the capture
 * writer turns the same replays into docs/api examples (BR-26).
 *
 * @param id {@code <operationId>-<state>-<n>} - addressable, unique
 * @param operationId the registry entry the scenario exercises (BR-25)
 * @param state "happy" or "problem"
 * @param note why this scenario exists, for a reader of the docs examples
 * @param method HTTP method
 * @param path request path
 * @param body JSON request body, or null for none
 * @param expectStatus expected response status
 * @param expectProblem problem code the body must carry when state is "problem"; else null
 */
public record HarnessCase(
    String id,
    String operationId,
    String state,
    String note,
    String method,
    String path,
    String body,
    int expectStatus,
    String expectProblem) {}
