"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "twins",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_table(
        "twin_revisions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("twin_id", sa.Integer, sa.ForeignKey("twins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.Integer, nullable=False),
        sa.Column("parent_number", sa.Integer, nullable=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("note", sa.Text, nullable=False),
        sa.Column("note_i18n", sa.JSON, nullable=False),
        sa.Column("diff", sa.JSON, nullable=False),
        sa.Column("content", sa.JSON, nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("created_at", TS, nullable=False),
        sa.UniqueConstraint("twin_id", "number", name="uq_revision_number"),
    )
    op.create_index("ix_twin_revisions_twin_id", "twin_revisions", ["twin_id"])
    op.create_table(
        "node_positions",
        sa.Column("twin_id", sa.Integer, sa.ForeignKey("twins.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("asset_id", sa.String(64), primary_key=True),
        sa.Column("x", sa.Float, nullable=False),
        sa.Column("y", sa.Float, nullable=False),
    )
    op.create_table(
        "simulation_runs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("twin_id", sa.Integer, sa.ForeignKey("twins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision_number", sa.Integer, nullable=False),
        sa.Column("scenario", sa.String(48), nullable=False),
        sa.Column("params", sa.JSON, nullable=False),
        sa.Column("result", sa.JSON, nullable=False),
        sa.Column("result_hash", sa.String(64), nullable=False),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_index("ix_simulation_runs_twin_id", "simulation_runs", ["twin_id"])
    op.create_index("ix_simulation_runs_result_hash", "simulation_runs", ["result_hash"])
    op.create_table(
        "remediations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("twin_id", sa.Integer, sa.ForeignKey("twins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_revision", sa.Integer, nullable=False),
        sa.Column("to_revision", sa.Integer, nullable=False),
        sa.Column("scenario", sa.String(48), nullable=False),
        sa.Column("params", sa.JSON, nullable=False),
        sa.Column("actions", sa.JSON, nullable=False),
        sa.Column("comparison", sa.JSON, nullable=False),
        sa.Column("reverted_by_revision", sa.Integer, nullable=True),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_index("ix_remediations_twin_id", "remediations", ["twin_id"])
    op.create_table(
        "events",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("twin_id", sa.Integer, sa.ForeignKey("twins.id", ondelete="CASCADE"), nullable=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("params", sa.JSON, nullable=False),
        sa.Column("read", sa.Boolean, nullable=False),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_table(
        "ai_cache",
        sa.Column("key", sa.String(160), primary_key=True),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("created_at", TS, nullable=False),
    )


def downgrade() -> None:
    for table in ("ai_cache", "events", "remediations", "simulation_runs", "node_positions"):
        op.drop_table(table)
    op.drop_index("ix_twin_revisions_twin_id", "twin_revisions")
    op.drop_table("twin_revisions")
    op.drop_table("twins")
