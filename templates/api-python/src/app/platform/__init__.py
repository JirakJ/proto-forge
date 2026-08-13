"""The platform kernel's public surface: problem catalogue, structured logging,
security headers and health routes. Part of the byte-pinned seed (BRS 13)."""

from app.platform.headers import SECURITY_HEADERS, SecurityHeadersMiddleware
from app.platform.health import ServiceInfo, register_health
from app.platform.logger import Logger, create_logger, noop_logger
from app.platform.problems import AppProblem, ProblemDef, problems

__all__ = [
    "SECURITY_HEADERS",
    "AppProblem",
    "Logger",
    "ProblemDef",
    "SecurityHeadersMiddleware",
    "ServiceInfo",
    "create_logger",
    "noop_logger",
    "problems",
    "register_health",
]
