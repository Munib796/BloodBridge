from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.blood_requests import controller as blood_requests_controller
from src.chat.models import ChatThread
from src.request_matches import dtos
from src.request_matches.models import RequestMatch
from src.utils.auth import Identity, require_roles
from src.utils.enums import MatchStatus

# Either a Donor or an Organization can accept/fulfil a request.
get_current_acceptor = require_roles("donor", "organization")


def accept_request(request_id: str, data: dtos.MatchAccept, db: Session, identity: Identity) -> RequestMatch:
    blood_request = blood_requests_controller.get_request(request_id, db)

    # Blood-type compatibility and proximity are enforced here, not only in the
    # nearby listing — otherwise any donor could POST any request ID.
    blood_requests_controller.assert_acceptor_eligible(blood_request, identity, db)
    _assert_no_open_commitment(blood_request, identity, db)

    match = RequestMatch(
        blood_request_id=blood_request.id,
        donor_id=identity.entity.id if identity.role == "donor" else None,
        organization_id=identity.entity.id if identity.role == "organization" else None,
        units_committed=data.units_committed,
        eta=data.eta,
    )

    # One transaction for the whole accept: reserving units, recording the
    # match and opening the chat thread now succeed or fail together. Splitting
    # them meant a failure after the reservation left units held by no one.
    try:
        blood_requests_controller.atomic_reserve_units(blood_request, data.units_committed, db)
        db.add(match)
        db.flush()
        db.add(ChatThread(request_match_id=match.id))
        db.commit()
    except IntegrityError:
        db.rollback()
        # The partial unique index caught a double-accept that slipped past the
        # check above (two concurrent requests from the same account).
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an open commitment on this request",
        )
    except Exception:
        db.rollback()
        raise

    db.refresh(match)
    return match


def update_eta(match_id: str, data: dtos.MatchUpdateEta, db: Session, identity: Identity) -> RequestMatch:
    match = _get_owned_match(match_id, db, identity)
    _assert_open(match)
    match.eta = data.eta
    db.commit()
    db.refresh(match)
    return match


def cancel_match(match_id: str, data: dtos.MatchCancel, db: Session, identity: Identity) -> RequestMatch:
    match = _get_owned_match(match_id, db, identity)
    _assert_open(match)

    blood_request = blood_requests_controller.get_request(str(match.blood_request_id), db)

    try:
        match.status = MatchStatus.CANCELLED
        match.cancel_reason = data.reason
        # Reopens the parent request for other donors/orgs to respond to.
        blood_requests_controller.release_units(blood_request, match.units_committed, db)
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(match)
    return match


def complete_match(match_id: str, db: Session, identity: Identity) -> RequestMatch:
    match = _get_owned_match(match_id, db, identity)
    _assert_open(match)

    blood_request = blood_requests_controller.get_request(str(match.blood_request_id), db)

    try:
        match.status = MatchStatus.COMPLETED
        match.completed_at = datetime.now(timezone.utc)
        db.flush()
        # Once no commitment is outstanding and the target is met, the request
        # is genuinely FULFILLED rather than merely FULLY_MATCHED.
        blood_requests_controller.mark_fulfilled_if_complete(blood_request, db)
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(match)
    return match


def list_my_matches(db: Session, identity: Identity) -> list[RequestMatch]:
    query = db.query(RequestMatch)
    if identity.role == "donor":
        query = query.filter(RequestMatch.donor_id == identity.entity.id)
    else:
        query = query.filter(RequestMatch.organization_id == identity.entity.id)
    return query.order_by(RequestMatch.accepted_at.desc()).all()


def _assert_open(match: RequestMatch) -> None:
    if match.status != MatchStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Match is already {match.status.value}",
        )


def _assert_no_open_commitment(blood_request, identity: Identity, db: Session) -> None:
    query = db.query(RequestMatch.id).filter(
        RequestMatch.blood_request_id == blood_request.id,
        RequestMatch.status == MatchStatus.ACCEPTED,
    )
    if identity.role == "donor":
        query = query.filter(RequestMatch.donor_id == identity.entity.id)
    else:
        query = query.filter(RequestMatch.organization_id == identity.entity.id)

    if db.query(query.exists()).scalar():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an open commitment on this request",
        )


def _get_owned_match(match_id: str, db: Session, identity: Identity) -> RequestMatch:
    match = db.query(RequestMatch).filter(RequestMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    entity_id = identity.entity.id
    is_owner = (identity.role == "donor" and match.donor_id == entity_id) or (
        identity.role == "organization" and match.organization_id == entity_id
    )
    if not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your match")
    return match
