"""donors: device_token for push notifications

Revision ID: b91c47e5f3a2
Revises: a7f3c9d21b84
Create Date: 2026-09-01 10:20:00.000000

Adds the nullable column the app writes via PATCH /donors/me/device-token.
Null means "this donor has no registered device", which is the state every
existing row starts in — so no backfill, and nothing to do on downgrade beyond
dropping the column.

Deliberately unindexed: the notification query filters `device_token IS NOT
NULL` only alongside blood type and the GiST spatial predicate, both of which
are already indexed and far more selective.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b91c47e5f3a2"
down_revision: Union[str, Sequence[str], None] = "a7f3c9d21b84"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("donors", sa.Column("device_token", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("donors", "device_token")
