from collections.abc import Sequence
from typing import cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.adapters.inbound.http.route_def import RouteDef
from app.adapters.inbound.http.routes import routes
from app.application.note.note_service import NoteService
from app.platform.headers import SECURITY_HEADERS, SecurityHeadersMiddleware
from app.platform.health import ServiceInfo, register_health
from app.platform.logger import Logger, noop_logger
from app.platform.problems import AppProblem, ProblemDef, problems

SERVICE_VERSION = "0.1.0"


def build_app(
    service: NoteService | None = None, *, logger: Logger = noop_logger, git_sha: str = "dev"
) -> FastAPI:
    """The registry IS the wiring: every RouteDef becomes one FastAPI route with
    boundary validation from its endpoint's typed signature (BRS 16). The
    contract emitter builds the app with no service — OpenAPI generation never
    invokes a handler — while every composition root injects one."""
    app = FastAPI(
        title="proto-forge-service",
        version=SERVICE_VERSION,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    if service is not None:
        app.state.service = service
    app.state.logger = logger
    app.add_middleware(SecurityHeadersMiddleware)
    register_health(app, ServiceInfo(version=SERVICE_VERSION, git_sha=git_sha))
    wire_routes(app, routes)
    app.add_exception_handler(AppProblem, _on_app_problem)
    app.add_exception_handler(RequestValidationError, _on_validation_error)
    app.add_exception_handler(StarletteHTTPException, _on_http_exception)
    app.add_exception_handler(Exception, _on_unhandled)
    return app


def wire_routes(app: FastAPI, defs: Sequence[RouteDef]) -> None:
    for definition in defs:
        app.add_api_route(
            definition.path,
            definition.endpoint,
            methods=[definition.method],
            operation_id=definition.operation_id,
            summary=definition.summary,
            status_code=definition.status_code,
            response_model=definition.response_model,
            responses=problem_responses(definition.problems),
        )


def problem_responses(codes: Sequence[str]) -> dict[int | str, dict[str, object]]:
    """The error half of an operation's contract: one response per problem
    status, content application/problem+json. Every operation implicitly
    carries 500 — the global handler maps any unregistered failure to the
    catalogue's "internal" problem."""
    by_status: dict[int, list[ProblemDef]] = {}
    for code in [*codes, "internal"]:
        definition = problems.get(code)
        if definition is None:
            message = f'route registry names unknown problem code "{code}"'
            raise ValueError(message)
        by_status.setdefault(definition.status, []).append(definition)
    return {
        status: {
            "description": "; ".join(definition.title for definition in definitions),
            "content": {
                "application/problem+json": {"schema": {"$ref": "#/components/schemas/Problem"}}
            },
        }
        for status, definitions in sorted(by_status.items())
    }


def _send_problem(problem: AppProblem, instance: str) -> JSONResponse:
    # The headers are repeated here because the outermost 500 handler responds
    # from outside the middleware stack; everywhere else the middleware wins.
    return JSONResponse(
        status_code=problem.definition.status,
        content=problem.body(instance),
        media_type="application/problem+json",
        headers=dict(SECURITY_HEADERS),
    )


async def _on_app_problem(request: Request, exc: Exception) -> JSONResponse:
    # The handler is registered for AppProblem; starlette types it over Exception.
    return _send_problem(cast(AppProblem, exc), request.url.path)


async def _on_validation_error(request: Request, exc: Exception) -> JSONResponse:
    error = cast(RequestValidationError, exc)
    detail = "; ".join(
        f"{'.'.join(str(loc) for loc in issue['loc'])}: {issue['msg']}" for issue in error.errors()
    )
    return _send_problem(AppProblem("validation-failed", detail), request.url.path)


async def _on_http_exception(request: Request, exc: Exception) -> JSONResponse:
    error = cast(StarletteHTTPException, exc)
    # 404 (no match) and 405 (wrong verb on a known path) are both "no such
    # operation" to a consumer; anything else the framework raises is internal.
    if error.status_code in (404, 405):
        return _send_problem(AppProblem("route-not-found"), request.url.path)
    return _send_problem(AppProblem("internal"), request.url.path)


async def _on_unhandled(request: Request, exc: Exception) -> JSONResponse:
    logger: Logger = request.app.state.logger
    logger.error("unhandled error", err=f"{type(exc).__name__}: {exc}")
    return _send_problem(AppProblem("internal"), request.url.path)
