from dataclasses import dataclass

from fastapi import FastAPI


@dataclass(frozen=True)
class ServiceInfo:
    version: str
    # Git commit the running build was cut from; "dev" outside CI.
    git_sha: str


# PLATFORM routes, deliberately outside the route registry and the contract:
# /healthz and /version are infrastructure a load balancer or deploy probe talks
# to, not API surface a consumer programs against — so they carry no operationId,
# no docs examples and no contract entry (include_in_schema=False keeps them out
# of app.openapi()).
def register_health(app: FastAPI, info: ServiceInfo) -> None:
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    def version() -> dict[str, str]:
        return {"version": info.version, "gitSha": info.git_sha}

    app.add_api_route("/healthz", healthz, methods=["GET"], include_in_schema=False)
    app.add_api_route("/version", version, methods=["GET"], include_in_schema=False)
