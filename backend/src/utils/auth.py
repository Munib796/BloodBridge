"""Shared authentication plumbing.

Every module used to decode tokens on its own, which is how the chat module
ended up accepting email-verification and password-reset tokens as logins.
All role resolution now funnels through here, so the `purpose` check and the
password-change invalidation check can't be forgotten in one place.
"""

from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from src.donors.models import Donor
from src.hospitals.models import Hospital
from src.organizations.models import Organization
from src.requestors.models import Requestor
from src.utils.database import get_db
from src.utils.enums import ApprovalStatus
from src.utils.helpers import decode_access_token

# Plain bearer, not OAuth2: the login endpoints take a JSON body rather than
# OAuth2 form data, so the password flow's tokenUrl only ever produced a
# username/password form in Swagger that couldn't work. HTTPBearer advertises a
# single "paste your token" box instead.
# auto_error=False so we can raise our own 401 with a consistent body.
bearer_scheme = HTTPBearer(auto_error=False)

ROLE_MODELS: dict[str, Any] = {
    "donor": Donor,
    "requestor": Requestor,
    "hospital": Hospital,
    "organization": Organization,
}

# Roles whose account must be admin-approved before the token is honoured, so
# revoking an approval takes effect immediately instead of at token expiry.
APPROVAL_GATED_ROLES = ("hospital", "organization")


@dataclass
class Identity:
    """Who is making the request. `entity` is the loaded DB row, or None for
    admin (which has no table)."""

    role: str
    id: str
    entity: Any | None = None

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def assert_credentials_current(entity: Any, payload: dict[str, Any]) -> None:
    """Reject access tokens issued before the account's last password change,
    so resetting a password logs out existing sessions."""
    changed_at = getattr(entity, "password_changed_at", None)
    if changed_at is None:
        return
    issued_at = payload.get("iat")
    if issued_at is None:
        # Pre-dates the iat claim — treat as stale rather than trusting it.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please log in again")
    # Truncate to whole seconds: `iat` is integer seconds, while the column
    # keeps microseconds, so a token minted moments after a change would
    # otherwise compare as older than it.
    if int(changed_at.timestamp()) > int(issued_at):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please log in again")


def load_entity(role: str, entity_id: Any, db: Session, payload: dict[str, Any]) -> Any:
    model = ROLE_MODELS.get(role)
    if model is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unknown role")

    entity = db.query(model).filter(model.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"{role.capitalize()} not found")

    assert_credentials_current(entity, payload)

    if getattr(entity, "is_active", True) is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

    if role in APPROVAL_GATED_ROLES and entity.approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {entity.approval_status.value}, awaiting admin approval",
        )

    return entity


def token_from(credentials: HTTPAuthorizationCredentials | None) -> str:
    """Pull the raw token out of an `Authorization: Bearer <token>` header.

    Because the scheme runs with auto_error=False, a header that is missing,
    empty, or not Bearer arrives here as None rather than as FastAPI's own 403 —
    so this is where that becomes the module's usual 401.
    """
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return credentials.credentials


def resolve_identity(token: str | None, db: Session) -> Identity:
    """Turn a bearer token into an Identity. Enforces purpose == "access"."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_access_token(token)
    role, entity_id = payload.get("role"), payload.get("id")
    if not role or not entity_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if role == "admin":
        return Identity(role="admin", id=str(entity_id), entity=None)

    entity = load_entity(role, entity_id, db, payload)
    return Identity(role=role, id=str(entity_id), entity=entity)


def get_current_identity(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Identity:
    """Any authenticated caller, whatever their role."""
    return resolve_identity(token_from(credentials), db)


def require_roles(*roles: str):
    """Dependency factory: authenticated *and* one of `roles`."""

    def dependency(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
        db: Session = Depends(get_db),
    ) -> Identity:
        identity = resolve_identity(token_from(credentials), db)
        if identity.role not in roles:
            allowed = " or ".join(roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only {allowed} accounts can perform this action",
            )
        return identity

    return dependency


def get_current_entity(role: str):
    """Dependency factory for the single-role `/me`-style endpoints, returning
    the DB row directly so existing signatures stay unchanged."""

    def dependency(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
        db: Session = Depends(get_db),
    ) -> Any:
        payload = decode_access_token(token_from(credentials), expected_role=role)
        return load_entity(role, payload.get("id"), db, payload)

    return dependency
