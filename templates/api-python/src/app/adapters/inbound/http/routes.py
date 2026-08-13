# @adr 008 - the route registry: one table, everything derives from it
#
# The demo `Note` slice registers its routes here; a generated service replaces
# them with the brief's operations (facet order). The list is the iteration
# order of the contract and the docs.
from app.adapters.inbound.http.note_routes import note_routes
from app.adapters.inbound.http.route_def import RouteDef

routes: list[RouteDef] = [*note_routes]
