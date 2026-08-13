# Against the real engine (BRS 15): Testcontainers Postgres boots empty and the
# committed alembic migrations create the schema, so these tests also prove the
# migration bootstrap produces the model's schema — constraints, ordering and
# not-found paths included.
from sqlalchemy import Engine, text

from app.adapters.outbound.persistence.note_repository import PostgresNoteRepository
from app.domain.note.__fixtures__.note_factory import make_note


class TestPostgresNoteRepository:
    def test_starts_empty_the_migrations_created_the_table_nothing_seeded_it(
        self, migrated_engine: Engine
    ) -> None:
        assert PostgresNoteRepository(migrated_engine).list() == []

    def test_round_trips_create_get_list_and_delete(self, migrated_engine: Engine) -> None:
        repo = PostgresNoteRepository(migrated_engine)
        first = make_note()
        second = make_note()
        assert repo.create(first) == first
        repo.create(second)

        assert repo.get(str(first.id)) == first
        assert repo.list() == [first, second]

        assert repo.delete(str(first.id)) is True
        assert repo.get(str(first.id)) is None
        assert repo.list() == [second]
        assert repo.delete(str(second.id)) is True

    def test_orders_the_list_by_created_at_then_id_regardless_of_insertion_order(
        self, migrated_engine: Engine
    ) -> None:
        repo = PostgresNoteRepository(migrated_engine)
        later = make_note(createdAt="2025-03-01T00:00:00.000Z")
        earlier = make_note(createdAt="2025-02-01T00:00:00.000Z")
        tie_break = make_note(createdAt="2025-03-01T00:00:00.000Z")
        repo.create(later)
        repo.create(tie_break)
        repo.create(earlier)

        first_tie, second_tie = sorted([later.id, tie_break.id], key=lambda u: u.bytes)
        assert [note.id for note in repo.list()] == [earlier.id, first_tie, second_tie]

        for note in (later, earlier, tie_break):
            repo.delete(str(note.id))

    def test_returns_none_and_false_for_an_id_that_never_existed(
        self, migrated_engine: Engine
    ) -> None:
        repo = PostgresNoteRepository(migrated_engine)
        ghost = make_note()
        assert repo.get(str(ghost.id)) is None
        assert repo.delete(str(ghost.id)) is False

    def test_the_migrations_enforce_the_not_null_constraints(
        self, migrated_engine: Engine
    ) -> None:
        with migrated_engine.connect() as connection:
            nullable = connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'notes' AND is_nullable = 'YES'"
                )
            ).fetchall()
        assert nullable == []
