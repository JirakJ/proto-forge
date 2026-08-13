package app.adapters.`in`.http

// @adr 008 - the route registry is the contract's single source
//
// Every HTTP operation is one entry HERE, and nowhere else: the Ktor wiring
// (RouteRegistrar), the OpenAPI contract (the contractEmit slice), the docs
// examples and the e2e conformance suite are all DERIVED from this table. A route
// declared ad hoc inside a `routing { }` block would be an operation the contract
// cannot see - opid:scan fails the path literal, and RouteDef makes the shape and
// the problem list required rather than polite.
//
// operationId is the backend's addressability surface (BR-25): kebab-case
// `<resource>-<verb>`, unique across the app, the same grammar as the frontend's
// testids - contract clients, docs examples and e2e scenarios all key on it.
public object RouteRegistry {

    /**
     * The demo `Note` slice registers its routes here; a generated service replaces
     * them with the brief's operations (facet order). The list is the iteration
     * order of the contract and the docs.
     */
    public val ROUTES: List<RouteDef> = NoteRoutes.NOTE_ROUTES
}
