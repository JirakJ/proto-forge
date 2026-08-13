# Determinism (NFR-18): date logic must not pass on one machine's timezone and
# fail on another's. Unlike a node worker, a Python process CAN re-pin its zone
# at runtime (time.tzset), so the pin lives HERE in the test configuration
# itself — the same conftest every pytest run loads, including the ones mutmut
# spawns, which an env prefix on the test:unit script would never reach. The
# assertion keeps the pin honest: a platform that cannot apply it (no tzset
# outside POSIX) is a printed warning, never a silent skip.
import os
import sys
import time
from collections.abc import Iterator

import pytest

from app.domain.__fixtures__.factory import reset_factory_sequence

os.environ["TZ"] = "UTC"
if hasattr(time, "tzset"):
    time.tzset()
    _resolved = time.strftime("%Z")
    if _resolved not in ("UTC", "GMT"):
        _message = (
            f'tests must run under TZ=UTC but the resolved zone is "{_resolved}". '
            "The pin lives in tests/conftest.py (os.environ + time.tzset) — restore it, "
            "and keep date logic on UTC instants. See docs/TROUBLESHOOTING.md."
        )
        raise RuntimeError(_message)
else:
    # Non-POSIX platforms lack tzset: the pin is declared but cannot take here.
    sys.stderr.write("warning: time.tzset is unavailable here - the TZ=UTC pin is declared but unenforced\n")


# Deterministic fixtures: the factory counter restarts before every test, so a
# test's fixture values never depend on what ran before it.
@pytest.fixture(autouse=True)
def _reset_factory_sequence() -> Iterator[None]:
    reset_factory_sequence()
    yield
