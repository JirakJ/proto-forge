package app.platform;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The only throwable a handler may use for a client-visible failure (BR-23). Its
 * constructor accepts only registered codes - an unknown code fails at the throw
 * site, and the error:catalog gate fails the build before it gets that far.
 */
public final class AppProblem extends RuntimeException {

  private final transient ProblemDef def;
  private final String detail;

  public AppProblem(String code) {
    this(code, null);
  }

  public AppProblem(String code, String detail) {
    super(Problems.byCode(code).title());
    this.def = Problems.byCode(code);
    this.detail = detail;
  }

  public ProblemDef def() {
    return def;
  }

  /** The RFC 9457 body. {@code type} is a stable relative URI under /problems/. */
  public Map<String, Object> body(String instance) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("type", "/problems/" + def.code());
    body.put("title", def.title());
    body.put("status", def.status());
    if (detail != null) {
      body.put("detail", detail);
    }
    body.put("instance", instance);
    body.put("code", def.code());
    return body;
  }
}
