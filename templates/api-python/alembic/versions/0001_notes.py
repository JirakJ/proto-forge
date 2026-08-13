"""0001: the Note slice's only relation. Append-only history (BR-24):
corrections are new migrations, never edits here. Mirrored by
src/app/adapters/outbound/persistence/db.py."""

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    )


def downgrade() -> None:
    # @adr 006 - the downgrade mirrors exactly the relation this file created
    op.drop_table("notes")
