"""donors: is_available for the Available/Unavailable toggle

Revision ID: c4d8e1a96f27
Revises: b91c47e5f3a2
Create Date: 2026-09-15 12:00:00.000000

Adds the flag behind the donor home screen's Available/Unavailable pill. An
unavailable donor is skipped by notification targeting and is refused when
accepting a request; they keep any commitment they already hold, and their
stored location is left untouched so flipping back on needs no fresh GPS fix.

Backfilled to true. That is what the frontend's toggle starts at
(DonorHomeScreen) and it preserves the behaviour of every pre-existing row —
before this column, every donor with a location and a device token was
notified. Defaulting to false would instead have silently muted the whole
existing donor base.

The server_default exists only to backfill; it is dropped immediately after,
so the resulting DDL matches the model, which carries a Python-side
`default=True` like donors.is_active beside it.

Deliberately unindexed, for the same reason as device_token: the notification
query filters this only alongside blood type and the GiST spatial predicate,
both of which are far more selective. A boolean is a poor index candidate.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d8e1a96f27"
down_revision: Union[str, Sequence[str], None] = "b91c47e5f3a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "donors",
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.alter_column("donors", "is_available", server_default=None)


def downgrade() -> None:
    op.drop_column("donors", "is_available")
