"""notifications_typed_columns_and_read_at

Revision ID: 4fc43f118cde
Revises: f1c2a39d0b1a
Create Date: 2026-09-20 10:30:01.475321

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "4fc43f118cde"
down_revision: Union[str, Sequence[str], None] = "f1c2a39d0b1a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    op.add_column("notifications", sa.Column("blood_request_id", sa.UUID(as_uuid=True), nullable=True))
    op.add_column("notifications", sa.Column("request_match_id", sa.UUID(as_uuid=True), nullable=True))
    op.add_column("notifications", sa.Column("pushed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("notifications", sa.Column("read_at", sa.DateTime(timezone=True), nullable=True))

    op.execute(
        "UPDATE notifications SET read_at = created_at WHERE is_read = TRUE"
    )

    op.drop_index("ix_notifications_recipient_role_read_created", table_name="notifications")
    op.create_index(
        "ix_notifications_recipient_role_read_created",
        "notifications",
        ["recipient_id", "recipient_role", "read_at", "created_at"],
    )
    op.create_index("ix_notifications_blood_request_id", "notifications", ["blood_request_id"])
    op.create_index("ix_notifications_request_match_id", "notifications", ["request_match_id"])

    op.execute("ALTER TABLE notifications DROP COLUMN is_read")

    inspect = sa.inspect(bind)
    existing_fk = any(
        fk["constrained_columns"] == ["blood_request_id"] and fk["referred_table"] == "blood_requests"
        for fk in inspect.get_foreign_keys("notifications")
    )
    if not existing_fk:
        op.create_foreign_key(
            "fk_notifications_blood_request_id_blood_requests",
            "notifications",
            "blood_requests",
            ["blood_request_id"],
            ["id"],
        )

    existing_match_fk = any(
        fk["constrained_columns"] == ["request_match_id"] and fk["referred_table"] == "request_matches"
        for fk in inspect.get_foreign_keys("notifications")
    )
    if not existing_match_fk:
        op.create_foreign_key(
            "fk_notifications_request_match_id_request_matches",
            "notifications",
            "request_matches",
            ["request_match_id"],
            ["id"],
        )


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()

    inspect = sa.inspect(bind)
    existing_fk = any(
        fk["constrained_columns"] == ["blood_request_id"] and fk["referred_table"] == "blood_requests"
        for fk in inspect.get_foreign_keys("notifications")
    )
    if existing_fk:
        op.drop_constraint("fk_notifications_blood_request_id_blood_requests", "notifications", type_="foreignkey")

    existing_match_fk = any(
        fk["constrained_columns"] == ["request_match_id"] and fk["referred_table"] == "request_matches"
        for fk in inspect.get_foreign_keys("notifications")
    )
    if existing_match_fk:
        op.drop_constraint("fk_notifications_request_match_id_request_matches", "notifications", type_="foreignkey")

    op.drop_index("ix_notifications_request_match_id", table_name="notifications")
    op.drop_index("ix_notifications_blood_request_id", table_name="notifications")
    op.drop_index("ix_notifications_recipient_role_read_created", table_name="notifications")
    op.create_index(
        "ix_notifications_recipient_role_read_created",
        "notifications",
        ["recipient_id", "recipient_role", "is_read", "created_at"],
    )

    op.add_column("notifications", sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute(
        "UPDATE notifications SET is_read = TRUE WHERE read_at IS NOT NULL"
    )
    op.execute("ALTER TABLE notifications DROP COLUMN read_at")
    op.execute("ALTER TABLE notifications DROP COLUMN pushed_at")
    op.execute("ALTER TABLE notifications DROP COLUMN request_match_id")
    op.execute("ALTER TABLE notifications DROP COLUMN blood_request_id")
