"""hardening: credential timestamps, check constraints, indexes

Revision ID: a7f3c9d21b84
Revises: 22db9659d0b8
Create Date: 2026-08-20 21:40:00.000000

Adds:
  * password_changed_at on every account table, so a password reset can
    invalidate existing sessions and make a reset link single-use;
  * CHECK constraints that enforce what the model comments only claimed
    (positive unit counts, "exactly one of these two columns is set");
  * the indexes the hot query paths were missing — Postgres does not index
    foreign keys automatically;
  * partial unique indexes so one donor/organization can hold at most one
    *open* commitment per request, while still being able to re-accept after
    cancelling.

Note: the CHECK constraints are validated against existing rows. On a database
with pre-existing data, clean up any row that has both (or neither) of
requestor_id/organization_id before running this.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7f3c9d21b84"
down_revision: Union[str, Sequence[str], None] = "22db9659d0b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ACCOUNT_TABLES = ("donors", "requestors", "hospitals", "organizations")


def upgrade() -> None:
    # --- Credential freshness ------------------------------------------
    for table in ACCOUNT_TABLES:
        op.add_column(
            table,
            sa.Column(
                "password_changed_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
        )
        # Existing accounts: treat the account's creation as its last password
        # change, so tokens issued before this migration stay valid.
        op.execute(f"UPDATE {table} SET password_changed_at = created_at WHERE created_at IS NOT NULL")

    # --- donors --------------------------------------------------------
    op.create_index("ix_donors_blood_type", "donors", ["blood_type"], unique=False)

    # --- blood_requests ------------------------------------------------
    op.create_check_constraint(
        "ck_blood_requests_units_needed_positive", "blood_requests", "units_needed > 0"
    )
    op.create_check_constraint(
        "ck_blood_requests_units_secured_non_negative", "blood_requests", "units_secured >= 0"
    )
    op.create_check_constraint(
        "ck_blood_requests_units_secured_within_needed",
        "blood_requests",
        "units_secured <= units_needed",
    )
    op.create_check_constraint(
        "ck_blood_requests_radius_positive", "blood_requests", "current_radius_km > 0"
    )
    op.create_check_constraint(
        "ck_blood_requests_one_poster",
        "blood_requests",
        "(requestor_id IS NOT NULL AND organization_id IS NULL)"
        " OR (requestor_id IS NULL AND organization_id IS NOT NULL)",
    )
    op.create_index("ix_blood_requests_status", "blood_requests", ["status"], unique=False)
    op.create_index(
        "ix_blood_requests_blood_type_needed", "blood_requests", ["blood_type_needed"], unique=False
    )
    op.create_index("ix_blood_requests_requestor_id", "blood_requests", ["requestor_id"], unique=False)
    op.create_index(
        "ix_blood_requests_organization_id", "blood_requests", ["organization_id"], unique=False
    )
    op.create_index("ix_blood_requests_hospital_id", "blood_requests", ["hospital_id"], unique=False)
    op.create_index("ix_blood_requests_required_by", "blood_requests", ["required_by"], unique=False)

    # --- request_matches -----------------------------------------------
    op.create_check_constraint(
        "ck_request_matches_units_positive", "request_matches", "units_committed > 0"
    )
    op.create_check_constraint(
        "ck_request_matches_one_acceptor",
        "request_matches",
        "(donor_id IS NOT NULL AND organization_id IS NULL)"
        " OR (donor_id IS NULL AND organization_id IS NOT NULL)",
    )
    op.create_index(
        "ix_request_matches_blood_request_id", "request_matches", ["blood_request_id"], unique=False
    )
    op.create_index("ix_request_matches_donor_id", "request_matches", ["donor_id"], unique=False)
    op.create_index(
        "ix_request_matches_organization_id", "request_matches", ["organization_id"], unique=False
    )
    # Enum columns store member names, hence 'ACCEPTED' rather than 'accepted'.
    op.create_index(
        "uq_request_matches_open_donor",
        "request_matches",
        ["blood_request_id", "donor_id"],
        unique=True,
        postgresql_where=sa.text("status = 'ACCEPTED' AND donor_id IS NOT NULL"),
    )
    op.create_index(
        "uq_request_matches_open_organization",
        "request_matches",
        ["blood_request_id", "organization_id"],
        unique=True,
        postgresql_where=sa.text("status = 'ACCEPTED' AND organization_id IS NOT NULL"),
    )

    # --- chat_messages -------------------------------------------------
    op.create_index(
        "ix_chat_messages_thread_sent_at", "chat_messages", ["chat_thread_id", "sent_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_thread_sent_at", table_name="chat_messages")

    op.drop_index("uq_request_matches_open_organization", table_name="request_matches")
    op.drop_index("uq_request_matches_open_donor", table_name="request_matches")
    op.drop_index("ix_request_matches_organization_id", table_name="request_matches")
    op.drop_index("ix_request_matches_donor_id", table_name="request_matches")
    op.drop_index("ix_request_matches_blood_request_id", table_name="request_matches")
    op.drop_constraint("ck_request_matches_one_acceptor", "request_matches", type_="check")
    op.drop_constraint("ck_request_matches_units_positive", "request_matches", type_="check")

    op.drop_index("ix_blood_requests_required_by", table_name="blood_requests")
    op.drop_index("ix_blood_requests_hospital_id", table_name="blood_requests")
    op.drop_index("ix_blood_requests_organization_id", table_name="blood_requests")
    op.drop_index("ix_blood_requests_requestor_id", table_name="blood_requests")
    op.drop_index("ix_blood_requests_blood_type_needed", table_name="blood_requests")
    op.drop_index("ix_blood_requests_status", table_name="blood_requests")
    op.drop_constraint("ck_blood_requests_one_poster", "blood_requests", type_="check")
    op.drop_constraint("ck_blood_requests_radius_positive", "blood_requests", type_="check")
    op.drop_constraint(
        "ck_blood_requests_units_secured_within_needed", "blood_requests", type_="check"
    )
    op.drop_constraint(
        "ck_blood_requests_units_secured_non_negative", "blood_requests", type_="check"
    )
    op.drop_constraint("ck_blood_requests_units_needed_positive", "blood_requests", type_="check")

    op.drop_index("ix_donors_blood_type", table_name="donors")

    for table in reversed(ACCOUNT_TABLES):
        op.drop_column(table, "password_changed_at")
