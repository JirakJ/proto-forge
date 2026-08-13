package app.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class AppLoggerTest {

  @Test
  void renderAppendsKeyValuePairs() {
    assertEquals("note created noteId=n-1 count=2", AppLogger.render("note created", "noteId", "n-1", "count", 2));
  }

  @Test
  void renderRedactsPiiNamedValues() {
    String line = AppLogger.render("login attempt", "password", "hunter2", "user", "u-1");

    assertTrue(line.contains("password=[redacted]"), line);
    assertFalse(line.contains("hunter2"), "a PII-keyed value must never reach a log line (NFR-12)");
    assertTrue(line.contains("user=u-1"), line);
  }

  @Test
  void renderIgnoresADanglingKey() {
    assertEquals("shutting down", AppLogger.render("shutting down", "orphan"));
  }

  @Test
  void levelsGoThroughTheDelegate() {
    Logger target = (Logger) LoggerFactory.getLogger(AppLoggerTest.class);
    ListAppender<ILoggingEvent> appender = new ListAppender<>();
    appender.start();
    target.addAppender(appender);
    try {
      AppLogger logger = AppLogger.get(AppLoggerTest.class);
      logger.info("listening", "port", 8080);
      logger.warn("slow query", "millis", 250);
      logger.error("unhandled error", "err", "IllegalStateException");
      logger.error("unhandled error with cause", new IllegalStateException("boom"), "err", "IllegalStateException");

      List<String> lines = appender.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
      assertEquals(
          List.of(
              "listening port=8080",
              "slow query millis=250",
              "unhandled error err=IllegalStateException",
              "unhandled error with cause err=IllegalStateException"),
          lines);
    } finally {
      target.detachAppender(appender);
    }
  }
}
