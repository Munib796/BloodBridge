"""notification foundation: requestor tokens + stored notifications

Revision ID: f1c2a39d0b1a
Revises: c4d8e1a96f27
Create Date: 2026-09-20 00:00:00.000000

This is the foundation layer only: requestor device registration parity and a
persistent notification log. It intentionally does not wire any actual push send
or trigger logic yet; those remain deliberate follow-up tasks.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from src.utils.enums import NotificationType, SenderType

# revision identifiers, used by Alembic.
revision: str = "f1c2a39d0b1a"
down_revision: Union[str, Sequence[str], None] = "c4d8e1a96f27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    sender_type_exists = bind.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = :name)"),
        {"name": "sender_type"},
    ).scalar()
    if not sender_type_exists:
        op.execute("CREATE TYPE sender_type AS ENUM ('DONOR', 'REQUESTOR', 'ORGANIZATION')")

    notification_type_exists = bind.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = :name)"),
        {"name": "notification_type"},
    ).scalar()
    if not notification_type_exists:
        op.execute(
            "CREATE TYPE notification_type AS ENUM ("
            "'NEW_NEARBY_REQUEST', 'FIRST_DONOR_ACCEPTED', 'REQUEST_COMPLETED', "
            "'REQUESTOR_CANCELLED', 'DONOR_CANCELLED', 'REQUEST_EXPIRED', "
            "'NEW_CHAT_MESSAGE', 'PARTIAL_ACCEPT', 'RADIUS_WIDENED', "
            "'DONOR_EAT_PASSED')"
        )

    op.add_column("requestors", sa.Column("device_token", sa.String(), nullable=True))

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY,
            recipient_id UUID NOT NULL,
            recipient_role sender_type NOT NULL,
            type notification_type NOT NULL,
            title VARCHAR NOT NULL,
            body TEXT NOT NULL,
            payload JSON,
            is_read BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_notifications_recipient_role_read_created "
        "ON notifications (recipient_id, recipient_role, is_read, created_at)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_notifications_type_created ON notifications (type, created_at)")


def downgrade() -> None:
    op.drop_index("ix_notifications_type_created", table_name="notifications")
    op.drop_index("ix_notifications_recipient_role_read_created", table_name="notifications")
    op.drop_table("notifications")
    op.drop_column("requestors", "device_token")
    # Shared enums are intentionally preserved: chat and other features may
    # still reference `sender_type` and `notification_type`.
