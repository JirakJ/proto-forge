# @adr 006 - alembic runtime: DATABASE_URL from the environment, autogenerate
# pointed at the model metadata so `alembic check` can prove the migrations
# and the model agree against a real database (BR-24; CI integration tier).
import os

from alembic import context
from sqlalchemy import create_engine

from app.adapters.outbound.persistence.db import Base

target_metadata = Base.metadata


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        message = "DATABASE_URL is not set; name the database to migrate"
        raise SystemExit(message)
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_database_url())
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
