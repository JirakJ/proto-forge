package app.platform;

import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

// Structured, redacting logging only (NFR-12): production code logs through this
// kernel wrapper, never System.out/System.err and never a bare SLF4J logger. The
// redaction list is the PII denylist - a value keyed by one of these names never
// leaves the process in clear text, even when a caller slips.
public final class AppLogger {

  private static final Pattern PII =
      Pattern.compile("password|passwd|secret|token|authorization|ssn|creditcard|email", Pattern.CASE_INSENSITIVE);

  private final Logger delegate;

  private AppLogger(Logger delegate) {
    this.delegate = delegate;
  }

  /** The one way production code obtains a logger. */
  public static AppLogger get(Class<?> owner) {
    return new AppLogger(LoggerFactory.getLogger(owner));
  }

  /** Structured call: a message plus alternating key/value pairs. */
  public void info(String message, Object... keyValues) {
    delegate.info(render(message, keyValues));
  }

  public void warn(String message, Object... keyValues) {
    delegate.warn(render(message, keyValues));
  }

  public void error(String message, Object... keyValues) {
    delegate.error(render(message, keyValues));
  }

  public void error(String message, Throwable cause, Object... keyValues) {
    delegate.error(render(message, keyValues), cause);
  }

  /** message key=value ..., with PII-named values replaced by [redacted]. */
  static String render(String message, Object... keyValues) {
    StringBuilder out = new StringBuilder(message);
    for (int i = 0; i + 1 < keyValues.length; i += 2) {
      String key = String.valueOf(keyValues[i]);
      Object value = PII.matcher(key).find() ? "[redacted]" : keyValues[i + 1];
      out.append(' ').append(key).append('=').append(value);
    }
    return out.toString();
  }
}
