from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from src.blood_requests import controller as blood_requests_controller
from src.chat.models import ChatThread
from src.donors.models import Donor
from src.organizations.models import Organization
from src.request_matches import dtos
from src.request_matches.models import RequestMatch
from src.utils.database import get_db
from src.utils.enums import MatchStatus
from src.utils.helpers import decode_token

oauth2_scheme_any = OAuth2PasswordBearer(tokenUrl="donors/login", auto_error=False)


def get_current_acceptor(token: str = Depends(oauth2_scheme_any), db: Session = Depends(get_db)) -> dict:
    """Either a Donor or an Organization can accept/fulfil a request."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(token)
    if payload.get("purpose") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    role = payload.get("role")
    if role == "donor":
        donor = db.query(Donor).filter(Donor.id == payload["id"]).first()
        if not donor:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Donor not found")
        return {"donor": donor, "organization": None}
    if role == "organization":
        org = db.query(Organization).filter(Organization.id == payload["id"]).first()
        if not org:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Organization not found")
        return {"donor": None, "organization": org}

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only donors or organizations can accept requests")


def accept_request(
    request_id: str,
    data: dtos.MatchAccept,
    db: Session,
    donor: Donor | None = None,
    organization: Organization | None = None,
) -> RequestMatch:
    # Atomic reserve — this is what prevents two acceptors racing on the
    # same units. If it raises 409, the caller already lost the race.
    blood_requests_controller.atomic_reserve_units(request_id, data.units_committed, db)

    match = RequestMatch(
        blood_request_id=request_id,
        donor_id=donor.id if donor else None,
        organization_id=organization.id if organization else None,
        units_committed=data.units_committed,
        eta=data.eta,
    )
    db.add(match)
    db.commit()
    db.refresh(match)

    db.add(ChatThread(request_match_id=match.id))
    db.commit()

    return match


def update_eta(match_id: str, data: dtos.MatchUpdateEta, db: Session, actor: dict) -> RequestMatch:
    match = _get_owned_match(match_id, db, actor)
    if match.status != MatchStatus.ACCEPTED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Match is not active")
    match.eta = data.eta
    db.commit()
    db.refresh(match)
    return match


def cancel_match(match_id: str, data: dtos.MatchCancel, db: Session, actor: dict) -> RequestMatch:
    match = _get_owned_match(match_id, db, actor)
    if match.status != MatchStatus.ACCEPTED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Match is not active")

    match.status = MatchStatus.CANCELLED
    match.cancel_reason = data.reason
    # Reopens the parent request for other donors/orgs to respond to.
    blood_requests_controller.release_units(str(match.blood_request_id), match.units_committed, db)
    db.commit()
    db.refresh(match)
    return match


def complete_match(match_id: str, db: Session, actor: dict) -> RequestMatch:
    match = _get_owned_match(match_id, db, actor)
    if match.status != MatchStatus.ACCEPTED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Match is not active")
    match.status = MatchStatus.COMPLETED
    match.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(match)
    return match


def list_my_matches(db: Session, actor: dict) -> list[RequestMatch]:
    query = db.query(RequestMatch)
    if actor.get("donor"):
        return query.filter(RequestMatch.donor_id == actor["donor"].id).all()
    return query.filter(RequestMatch.organization_id == actor["organization"].id).all()


def _get_owned_match(match_id: str, db: Session, actor: dict) -> RequestMatch:
    match = db.query(RequestMatch).filter(RequestMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    is_owner = (actor.get("donor") and match.donor_id == actor["donor"].id) or (
        actor.get("organization") and match.organization_id == actor["organization"].id
    )
    if not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your match")
    return match
