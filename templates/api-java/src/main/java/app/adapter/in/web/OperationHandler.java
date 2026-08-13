package app.adapter.in.web;

/**
 * A handler bean keyed by the registry's operationId (BR-25). Each implementation
 * is a mapping-annotation-free @RestController declaring exactly one public
 * {@code handle(...)} method; the RouteRegistrar wires it to its RouteDef's path
 * and method, so the registry stays the only place a path exists.
 */
public interface OperationHandler {

  /** The registry entry this bean implements. */
  String operationId();
}
