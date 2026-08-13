namespace App.Adapters.In.Http;

// @adr 008 - the route registry is the contract's single source
//
// Every HTTP operation is one entry HERE, and nowhere else: the minimal-API
// wiring (RouteRegistrar), the OpenAPI contract (OpenApiEmitter behind the
// --emit-openapi console mode), the docs examples and the e2e conformance suite
// are all DERIVED from this table. A route mapped ad hoc with app.MapGet("/...")
// would be an operation the contract cannot see - opid:scan fails the literal,
// and the RouteDef type makes the shape and problem list required rather than
// polite.
//
// operationId is the backend's addressability surface (BR-25): kebab-case
// `<resource>-<verb>`, unique across the app, the same grammar as the frontend's
// testids - contract clients, docs examples and e2e scenarios all key on it.
public static class RouteRegistry
{
    /// <summary>
    /// The demo `Note` slice registers its routes here; a generated service
    /// replaces them with the brief's operations (facet order). The list is the
    /// iteration order of the contract and the docs.
    /// </summary>
    public static readonly IReadOnlyList<RouteDef> ROUTES = NoteRoutes.NOTE_ROUTES.ToList();
}
