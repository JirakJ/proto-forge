package app.adapter.in.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// @adr 008 - the route registry's row type
/**
 * One HTTP operation: its addressable id, wire shape and declared problems. The
 * builder keeps definitions declarative and mechanically parseable - opid:scan,
 * error:catalog and the docs gates all read the {@code .operationId(...)} /
 * {@code .problems(...)} calls off the registry sources.
 *
 * @param operationId kebab-case {@code <resource>-<verb>}, unique (BR-25)
 * @param method HTTP method name, e.g. {@code GET}
 * @param path Spring-style path, e.g. {@code /notes/{id}}. Never inlined at a call site.
 * @param summary one sentence for the contract's {@code summary}
 * @param requestType JSON request-body type; null = no body
 * @param responseByStatus success shapes by status code; error shapes come from {@code problems}
 * @param problems problem codes (keys of the catalogue) this operation can emit (BR-23)
 */
public record RouteDef(
    String operationId,
    String method,
    String path,
    String summary,
    Class<?> requestType,
    Map<Integer, ResponseShape> responseByStatus,
    List<String> problems) {

  /** A success shape: the JSON body's element type; null type means "no content". */
  public record ResponseShape(Class<?> type, boolean array) {}

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private String operationId;
    private String method;
    private String path;
    private String summary;
    private Class<?> requestType;
    private final Map<Integer, ResponseShape> responseByStatus = new LinkedHashMap<>();
    private List<String> problems = List.of();

    public Builder operationId(String value) {
      this.operationId = value;
      return this;
    }

    public Builder method(String value) {
      this.method = value;
      return this;
    }

    public Builder path(String value) {
      this.path = value;
      return this;
    }

    public Builder summary(String value) {
      this.summary = value;
      return this;
    }

    public Builder request(Class<?> type) {
      this.requestType = type;
      return this;
    }

    public Builder response(int status, Class<?> type) {
      this.responseByStatus.put(status, new ResponseShape(type, false));
      return this;
    }

    public Builder responseList(int status, Class<?> type) {
      this.responseByStatus.put(status, new ResponseShape(type, true));
      return this;
    }

    public Builder noContent(int status) {
      this.responseByStatus.put(status, new ResponseShape(null, false));
      return this;
    }

    public Builder problems(String... codes) {
      this.problems = List.of(codes);
      return this;
    }

    public RouteDef build() {
      return new RouteDef(operationId, method, path, summary, requestType, Map.copyOf(responseByStatus), problems);
    }
  }
}
