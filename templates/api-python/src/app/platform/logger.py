# Structured, redacting logging only (NFR-12): production code logs through this
# factory, never print(). The redaction list is the PII denylist — a field with
# one of these names never leaves the process in clear text.
import logging
from collections.abc import MutableMapping
from typing import Protocol

import structlog

REDACTED_KEYS = frozenset(
    {"password", "passwd", "secret", "token", "authorization", "email", "ssn", "creditcard"}
)
CENSOR = "[redacted]"

_LEVELS = {
    "critical": logging.CRITICAL,
    "error": logging.ERROR,
    "warning": logging.WARNING,
    "info": logging.INFO,
    "debug": logging.DEBUG,
}


class Logger(Protocol):
    """The narrow surface the app programs against; structlog satisfies it."""

    def info(self, event: str, **kwargs: object) -> None: ...

    def warning(self, event: str, **kwargs: object) -> None: ...

    def error(self, event: str, **kwargs: object) -> None: ...


def redact_pii(
    _logger: object, _method_name: str, event_dict: MutableMapping[str, object]
) -> MutableMapping[str, object]:
    """A structlog processor: a PII-named field is censored before rendering."""
    for key in list(event_dict):
        if key.lower() in REDACTED_KEYS:
            event_dict[key] = CENSOR
    return event_dict


def create_logger(level: str = "info") -> Logger:
    """One JSON line per event on stdout, PII redacted, keys sorted."""
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            redact_pii,
            structlog.processors.JSONRenderer(sort_keys=True),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(_LEVELS.get(level, logging.INFO)),
        cache_logger_on_first_use=False,
    )
    logger: Logger = structlog.get_logger()
    return logger


class _NoopLogger:
    """For tests: same shape, no output."""

    def info(self, event: str, **kwargs: object) -> None:
        return None

    def warning(self, event: str, **kwargs: object) -> None:
        return None

    def error(self, event: str, **kwargs: object) -> None:
        return None


noop_logger: Logger = _NoopLogger()
