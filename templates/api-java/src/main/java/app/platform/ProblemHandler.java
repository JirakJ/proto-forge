package app.platform;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;

// @adr 004 - the one place errors become responses (RFC 9457, BR-23)
//
// Every client-visible failure leaves this advice as application/problem+json
// built from the registered catalogue. A registered AppProblem passes through;
// the framework's boundary failures map to their catalogue codes; anything else
// is logged server-side and served as the generic "internal" - the response body
// never leaks a stack trace or an exception message (BRS §16).
@RestControllerAdvice
public final class ProblemHandler {

  private static final AppLogger LOG = AppLogger.get(ProblemHandler.class);

  @ExceptionHandler(AppProblem.class)
  public ResponseEntity<Object> onAppProblem(AppProblem problem, HttpServletRequest request) {
    return respond(problem, request);
  }

  /** A @RequestBody that cannot be parsed at all: malformed or missing JSON. */
  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<Object> onUnreadableBody(HttpMessageNotReadableException cause, HttpServletRequest request) {
    return respond(new AppProblem("validation-failed", "body: malformed or missing JSON payload"), request);
  }

  /** A path/query parameter that does not convert to its declared type (a non-uuid id). */
  @ExceptionHandler(MethodArgumentTypeMismatchException.class)
  public ResponseEntity<Object> onTypeMismatch(MethodArgumentTypeMismatchException cause, HttpServletRequest request) {
    String expected = cause.getRequiredType() == null ? "the declared type" : "a well-formed " + cause.getRequiredType().getSimpleName();
    return respond(new AppProblem("validation-failed", cause.getName() + ": must be " + expected), request);
  }

  /** A @Valid boundary rejection, should a handler opt into argument validation. */
  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Object> onInvalidArgument(MethodArgumentNotValidException cause, HttpServletRequest request) {
    String detail = cause.getBindingResult().getFieldErrors().stream()
        .map(error -> error.getField() + ": " + error.getDefaultMessage())
        .sorted()
        .reduce((a, b) -> a + "; " + b)
        .orElse("request does not validate");
    return respond(new AppProblem("validation-failed", detail), request);
  }

  /** No route matches this method and path - the wrong verb on a known path included. */
  @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class, HttpRequestMethodNotSupportedException.class})
  public ResponseEntity<Object> onNoRoute(Exception cause, HttpServletRequest request) {
    return respond(new AppProblem("route-not-found"), request);
  }

  /** Anything unregistered: logged with its cause, served as the generic internal problem. */
  @ExceptionHandler(Exception.class)
  public ResponseEntity<Object> onUnexpected(Exception cause, HttpServletRequest request) {
    LOG.error("unhandled error", cause, "err", cause.getClass().getName());
    return respond(new AppProblem("internal"), request);
  }

  private static ResponseEntity<Object> respond(AppProblem problem, HttpServletRequest request) {
    return ResponseEntity.status(HttpStatus.valueOf(problem.def().status()))
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem.body(request.getRequestURI()));
  }
}
