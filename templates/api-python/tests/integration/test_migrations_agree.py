# BR-24's model-agreement proof, run natively: after the committed migrations
# have been applied to a real Postgres, alembic's autogenerate must find
# NOTHING to do — an empty diff IS the statement "the model and the migrations
# agree". migration:verify performs the name-level half offline on every run;
# this is the schema-level half, mandatory in CI (BRS 15/19).
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine

from app.adapters.outbound.persistence.db import Base


class TestMigrationsAgreeWithTheModel:
    def test_autogenerate_finds_an_empty_diff_after_upgrade_head(
        self, migrated_engine: Engine
    ) -> None:
        with migrated_engine.connect() as connection:
            context = MigrationContext.configure(connection)
            diff = compare_metadata(context, Base.metadata)
        assert diff == [], f"the model and the migrations disagree: {diff}"
