package app.adapter.in.web;

import java.util.List;

// @adr 008 - the route registry is the contract's single source
//
// Every HTTP operation is one entry HERE, and nowhere else: the Spring MVC wiring
// (RouteRegistrar), the OpenAPI contract (the contractEmit test slice), the docs
// examples and the e2e conformance suite are all DERIVED from this table. A route
// mapped ad hoc with an annotation would be an operation the contract cannot see -
// opid:scan fails the literal, and the RouteDef type makes the shape and problem
// list required rather than polite.
//
// operationId is the backend's addressability surface (BR-25): kebab-case
// `<resource>-<verb>`, unique across the app, the same grammar as the frontend's
// testids - contract clients, docs examples and e2e scenarios all key on it.
public final class RouteRegistry {

  /**
   * The demo `Note` slice registers its routes here; a generated service replaces
   * them with the brief's operations (facet order). The list is the iteration
   * order of the contract and the docs.
   */
  public static final List<RouteDef> ROUTES = List.copyOf(NoteRoutes.NOTE_ROUTES);

  private RouteRegistry() {}
}
