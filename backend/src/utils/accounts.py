"""Account plumbing shared by donors, requestors, hospitals and organizations.

These four modules each had their own copy of the signup/verify/login/reset
logic, which is how the missing email-verification check on login ended up in
two places at once. The rules live here now; the per-module controllers stay
responsible for their own DTOs and queries.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from src.utils.enums import ApprovalStatus
from src.utils.helpers import (
    create_purpose_token,
    credential_stamp,
    decode_token_for_purpose,
    hash_password,
)
from src.utils.mails import safe_send_password_reset_email, safe_send_verification_email
from src.utils.settings import settings

VERIFY_PURPOSE = "verify_email"
RESET_PURPOSE = "reset_password"


def queue_verification_email(entity: Any, role: str, background_tasks: BackgroundTasks) -> None:
    """Send the verification link after the response goes out, so a slow or
    broken SMTP server never delays signup or fails it."""
    token = create_purpose_token({"id": str(entity.id), "role": role}, purpose=VERIFY_PURPOSE)
    background_tasks.add_task(safe_send_verification_email, entity.email, token)


def queue_password_reset_email(entity: Any, role: str, background_tasks: BackgroundTasks) -> None:
    # The current credential stamp is baked into the token, so using the link
    # changes the stamp and the same link can't be replayed.
    token = create_purpose_token(
        {
            "id": str(entity.id),
            "role": role,
            "pwd": credential_stamp(entity.password_changed_at),
        },
        purpose=RESET_PURPOSE,
    )
    background_tasks.add_task(safe_send_password_reset_email, entity.email, token)


def decode_verification_token(token: str, role: str) -> dict[str, Any]:
    payload = decode_token_for_purpose(token, expected_purpose=VERIFY_PURPOSE)
    _assert_role(payload, role)
    return payload


def decode_reset_token(token: str, role: str) -> dict[str, Any]:
    payload = decode_token_for_purpose(token, expected_purpose=RESET_PURPOSE)
    _assert_role(payload, role)
    return payload


def apply_password_reset(entity: Any, new_password: str, payload: dict[str, Any], db: Session) -> None:
    """Set a new password, having checked the reset link hasn't already been
    used. Moving password_changed_at also invalidates every access token
    issued before now (see auth.assert_credentials_current)."""
    if payload.get("pwd") != credential_stamp(entity.password_changed_at):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has already been used or is no longer valid",
        )

    entity.password_hash = hash_password(new_password)
    entity.password_changed_at = datetime.now(timezone.utc)
    db.commit()


def assert_can_login(entity: Any, *, require_verification: bool) -> None:
    """Post-password checks common to every role."""
    if getattr(entity, "is_active", True) is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

    approval_status = getattr(entity, "approval_status", None)
    if approval_status is not None and approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {approval_status.value}, awaiting admin approval",
        )

    if (
        require_verification
        and settings.REQUIRE_EMAIL_VERIFICATION
        and not getattr(entity, "is_email_verified", True)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email address before logging in",
        )


def invalid_credentials() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


def _assert_role(payload: dict[str, Any], role: str) -> None:
    if payload.get("role") != role:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
