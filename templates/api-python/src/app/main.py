# Composition root — covered by the e2e conformance run and the CI integration
# tier, not unit coverage. Determinism is injected here and only here: the real
# clock and uuid4 enter as port dependencies, so everything below this file
# stays testable with pinned values.
import sys
from datetime import UTC, datetime
from uuid import uuid4

import uvicorn

from app.adapters.inbound.http.app import build_app
from app.adapters.outbound.persistence.engine import create_notes_engine
from app.adapters.outbound.persistence.note_repository import PostgresNoteRepository
from app.application.note.note_service import NoteService
from app.config.env import load_env
from app.platform.logger import create_logger


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def main() -> None:
    env = load_env()
    logger = create_logger(env.LOG_LEVEL)
    if env.DATABASE_URL is None:
        # Python has no in-process Postgres engine (BRS 15/19): serving always
        # needs a real database. Apply migrations first: pnpm db:migrate.
        message = "DATABASE_URL is required to serve; set it to a PostgreSQL URL"
        raise SystemExit(message)
    engine = create_notes_engine(str(env.DATABASE_URL))
    service = NoteService(
        repo=PostgresNoteRepository(engine),
        now=_now_iso,
        new_id=lambda: str(uuid4()),
    )
    app = build_app(service, logger=logger, git_sha=env.GIT_SHA)
    logger.info("listening", port=env.PORT)
    uvicorn.run(app, host="0.0.0.0", port=env.PORT, log_level=env.LOG_LEVEL)


if __name__ == "__main__":
    main()
    sys.exit(0)
