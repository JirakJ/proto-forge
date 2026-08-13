# Deterministic fixtures: the factory counter restarts before every test, so a
# test's fixture values never depend on what ran before it.
from collections.abc import Iterator

import pytest

from app.domain.__fixtures__.factory import reset_factory_sequence


@pytest.fixture(autouse=True)
def _reset_factory_sequence() -> Iterator[None]:
    reset_factory_sequence()
    yield
