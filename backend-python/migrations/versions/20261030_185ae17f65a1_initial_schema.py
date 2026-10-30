"""initial schema

Revision ID: 185ae17f65a1
Revises:
Create Date: 2026-10-30 12:32:56.253792

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "185ae17f65a1"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "namespaces",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("seeded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("clock", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint("name", name=op.f("pk_namespaces")),
    )
    op.create_table(
        "runs",
        sa.Column("namespace", sa.Text(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("spec", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["namespace"], ["namespaces.name"], name=op.f("fk_runs_namespace_namespaces"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("namespace", "id", name=op.f("pk_runs")),
    )
    op.create_table(
        "run_actions",
        sa.Column("seq", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("namespace", sa.Text(), nullable=False),
        sa.Column("run_id", sa.Text(), nullable=False),
        sa.Column("action_id", sa.Text(), nullable=False),
        sa.Column("action", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["namespace", "run_id"],
            ["runs.namespace", "runs.id"],
            name=op.f("fk_run_actions_namespace_run_id_runs"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("seq", name=op.f("pk_run_actions")),
        sa.UniqueConstraint("namespace", "run_id", "action_id", name=op.f("uq_run_actions_namespace_run_id_action_id")),
    )


def downgrade() -> None:
    op.drop_table("run_actions")
    op.drop_table("runs")
    op.drop_table("namespaces")
