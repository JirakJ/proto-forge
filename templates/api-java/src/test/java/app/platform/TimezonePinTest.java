package app.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.TimeZone;
import org.junit.jupiter.api.Test;

// Determinism (NFR-18): date logic must not pass on one machine's timezone and
// fail on another's. build.gradle.kts pins user.timezone=UTC (and TZ) on every
// test task via pinnedJvm(), which the JVM reads at start — a runtime re-pin
// here would be theatre. This assertion makes a dropped pin fail HERE, loudly,
// instead of months later as a flaky date assertion on someone else's laptop.
class TimezonePinTest {

  @Test
  void theTestJvmRunsOnUtc() {
    assertEquals(
        "UTC",
        TimeZone.getDefault().getID(),
        "tests must run under UTC — the pin lives in build.gradle.kts (pinnedJvm: user.timezone). "
            + "Restore it and keep date logic on UTC instants. See docs/TROUBLESHOOTING.md.");
  }
}
