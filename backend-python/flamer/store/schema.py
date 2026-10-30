from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    MetaData,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData(
    naming_convention={
        "pk": "pk_%(table_name)s",
        "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
        "uq": "uq_%(table_name)s_%(column_0_N_name)s",
        "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    }
)

namespaces = Table(
    "namespaces",
    metadata,
    Column("name", Text, primary_key=True),
    Column("seeded_at", DateTime(timezone=True), nullable=True),
    Column("clock", JSONB, nullable=True),
)

runs = Table(
    "runs",
    metadata,
    Column("namespace", Text, ForeignKey(namespaces.c.name, ondelete="CASCADE"), primary_key=True),
    Column("id", Text, primary_key=True),
    Column("created_at", BigInteger, nullable=False),
    Column("spec", JSONB, nullable=False),
)

run_actions = Table(
    "run_actions",
    metadata,
    Column("seq", BigInteger, Identity(always=True), primary_key=True),
    Column("namespace", Text, nullable=False),
    Column("run_id", Text, nullable=False),
    Column("action_id", Text, nullable=False),
    Column("action", JSONB, nullable=False),
    ForeignKeyConstraint(["namespace", "run_id"], [runs.c.namespace, runs.c.id], ondelete="CASCADE"),
    UniqueConstraint("namespace", "run_id", "action_id"),
)
