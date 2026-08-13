# Mirrors alembic/versions/0001_notes.py — migration:verify holds the two
# together (BR-24). The model never invents a column the migrations do not
# produce; alembic's env.py points autogenerate at this metadata, and the CI
# integration tier runs `alembic check` against a real Postgres to prove the
# agreement (BRS 15/19 per-stack escape).
import uuid
from datetime import datetime

from sqlalchemy import TIMESTAMP, Text, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class NoteRow(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
