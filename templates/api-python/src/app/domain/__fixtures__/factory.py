# Fixture data is built from the model it must not drift from: every produced
# value is PARSED through the pydantic model, so a drifted default fails loudly
# at the call site with pydantic naming the field. Deterministic by
# construction — values derive from a counter reset before each test
# (tests/conftest.py), never from random or the clock, so two runs see
# byte-identical fixtures.
#
# This lives under domain/__fixtures__ (coverage- and build-excluded, imported
# only by tests and fixtures) because the boundary profile lets every layer's
# fixtures reach the domain, while tests/ is reachable from no layer.
from collections.abc import Callable

from pydantic import BaseModel

_sequence = 0


def next_sequence() -> int:
    """The per-test counter. Reset by tests/conftest.py before each test."""
    global _sequence  # noqa: PLW0603 - the counter IS the module's one piece of state
    _sequence += 1
    return _sequence


def reset_factory_sequence() -> None:
    global _sequence  # noqa: PLW0603
    _sequence = 0


def define_factory[ModelT: BaseModel](
    model: type[ModelT], defaults: Callable[[int], dict[str, object]]
) -> Callable[..., ModelT]:
    """Build a factory for `model`. `defaults` receives the sequence number so ids
    can vary per instance while staying deterministic; `overrides` win per field.
    The result is model_validate()'d — the factory cannot produce a value the
    domain would reject."""

    def make(**overrides: object) -> ModelT:
        seq = next_sequence()
        return model.model_validate({**defaults(seq), **overrides})

    return make
