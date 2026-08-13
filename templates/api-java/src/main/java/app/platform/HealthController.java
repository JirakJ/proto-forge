package app.platform;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// PLATFORM routes, deliberately outside the route registry and the contract:
// /healthz and /version are infrastructure a load balancer or deploy probe talks
// to, not API surface a consumer programs against - so they carry no operationId,
// no docs examples and no contract entry (opid:scan exempts the kernel).
@RestController
public final class HealthController {

  private final ServiceInfo info;

  public HealthController(ServiceInfo info) {
    this.info = info;
  }

  @GetMapping("/healthz")
  public Map<String, String> healthz() {
    return Map.of("status", "ok");
  }

  @GetMapping("/version")
  public Map<String, String> version() {
    return Map.of("version", info.version(), "gitSha", info.gitSha());
  }
}
