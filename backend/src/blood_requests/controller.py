from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from geoalchemy2.functions import ST_Distance, ST_DWithin
from sqlalchemy import func as sa_func
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from src.blood_requests import dtos
from src.blood_requests.models import BloodRequest
from src.donors.models import Donor
from src.hospitals.models import Hospital
from src.request_matches.models import RequestMatch
from src.utils.auth import Identity, require_roles
from src.utils.constants import (
    COMPATIBLE_DONORS_FOR_RECIPIENT,
    DEFAULT_RADIUS_KM,
    MAX_RADIUS_KM,
    MIN_RADIUS_KM,
    OPEN_STATUSES,
    RADIUS_WIDEN_STEP_KM,
    REACTIVATABLE_STATUSES,
    TERMINAL_STATUSES,
    WIDEN_AFTER_MINUTES,
)
from src.utils.enums import ApprovalStatus, MatchStatus, RequestStatus
from src.utils.geo import make_point

# Statuses in which unit accounting is still meaningful, i.e. releasing units
# should put the request back in front of donors.
_RELEASE_LOCKED_STATUSES = (*TERMINAL_STATUSES, RequestStatus.EXPIRED)


def _find_registered_hospital(hospital_name: str | None, db: Session) -> Hospital | None:
    if not hospital_name:
        return None
    return (
        db.query(Hospital)
        .filter(sa_func.lower(Hospital.name) == hospital_name.strip().lower())
        .filter(Hospital.approval_status == ApprovalStatus.APPROVED)
        .first()
    )


def create_request(data: dtos.BloodRequestCreate, db: Session, identity: Identity) -> BloodRequest:
    hospital = _find_registered_hospital(data.hospital_name, db)
    is_hospital_backed = hospital is not None
    requestor_id = identity.entity.id if identity.role == "requestor" else None
    organization_id = identity.entity.id if identity.role == "organization" else None

    blood_request = BloodRequest(
        requestor_id=requestor_id,
        organization_id=organization_id,
        patient_name=data.patient_name,
        blood_type_needed=data.blood_type_needed,
        units_needed=data.units_needed,
        urgency_level=data.urgency_level,
        required_by=data.required_by,
        hospital_name_text=data.hospital_name,
        hospital_id=hospital.id if hospital else None,
        is_hospital_backed=is_hospital_backed,
        status=RequestStatus.PENDING_VERIFICATION if is_hospital_backed else RequestStatus.ACTIVE,
        current_radius_km=DEFAULT_RADIUS_KM[data.urgency_level],
        contact_phone=data.contact_phone,
        location=make_point(data.latitude, data.longitude),
        area_label=data.area_label,
    )
    db.add(blood_request)
    db.commit()
    db.refresh(blood_request)
    return blood_request


def get_request(request_id: str, db: Session) -> BloodRequest:
    """Unauthorized load — for internal use only. Endpoints must go through
    get_request_for_viewer() so patient details aren't handed out freely."""
    blood_request = db.query(BloodRequest).filter(BloodRequest.id == request_id).first()
    if not blood_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return blood_request


# --- Visibility -----------------------------------------------------------

def _donor_type_is_compatible(blood_request: BloodRequest, donor: Donor) -> bool:
    return donor.blood_type in COMPATIBLE_DONORS_FOR_RECIPIENT[blood_request.blood_type_needed]


def _within_request_radius(blood_request: BloodRequest, location, db: Session) -> bool:
    """Is `location` inside the radius this request is currently reaching out
    to? Evaluated in Postgres, since locations are PostGIS geographies."""
    if location is None:
        return False
    return bool(
        db.query(ST_DWithin(BloodRequest.location, location, BloodRequest.current_radius_km * 1000))
        .filter(BloodRequest.id == blood_request.id)
        .scalar()
    )


def _has_match(blood_request: BloodRequest, identity: Identity, db: Session) -> bool:
    """Has this donor/organization ever committed to this request? Once they
    have, they keep access to the details (and the chat) regardless of whether
    the request is still open or they have since moved out of range."""
    query = db.query(RequestMatch.id).filter(RequestMatch.blood_request_id == blood_request.id)
    if identity.role == "donor":
        query = query.filter(RequestMatch.donor_id == identity.entity.id)
    elif identity.role == "organization":
        query = query.filter(RequestMatch.organization_id == identity.entity.id)
    else:
        return False
    return db.query(query.exists()).scalar()


def assert_can_view_request(blood_request: BloodRequest, identity: Identity, db: Session) -> None:
    """Patient name and contact number are only for people with a reason to
    see them:

    * the poster (requestor or organization) and an admin;
    * the hospital named on the request, which has to verify it;
    * a donor the request is actively reaching out to — blood-type compatible
      and inside the current radius while the request is open;
    * an organization inside the radius (a blood bank holds many types, so no
      compatibility filter applies);
    * anyone who already committed to it, forever after.

    Anyone else gets a 404 rather than a 403, so request IDs can't be probed
    to confirm that a given patient exists.
    """
    entity = identity.entity

    if identity.is_admin:
        return
    if identity.role == "requestor" and blood_request.requestor_id == entity.id:
        return
    if identity.role == "organization" and blood_request.organization_id == entity.id:
        return
    if identity.role == "hospital" and blood_request.hospital_id == entity.id:
        return

    if identity.role in ("donor", "organization"):
        if _has_match(blood_request, identity, db):
            return
        if blood_request.status in OPEN_STATUSES and _within_request_radius(
            blood_request, entity.location, db
        ):
            if identity.role == "organization" or _donor_type_is_compatible(blood_request, entity):
                return

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Request not found, or no longer visible to you",
    )


def get_request_for_viewer(request_id: str, identity: Identity, db: Session) -> BloodRequest:
    blood_request = get_request(request_id, db)
    assert_can_view_request(blood_request, identity, db)
    return blood_request


def assert_acceptor_eligible(blood_request: BloodRequest, identity: Identity, db: Session) -> None:
    """Gate on accept, not just on listing. The nearby feed filters by blood
    type and distance, but a filtered list is not an authorization check — a
    donor could otherwise POST any request ID and consume its capacity."""
    if blood_request.status not in OPEN_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This request is not open for donations (status: {blood_request.status.value})",
        )

    entity = identity.entity
    if identity.role == "donor":
        if not _donor_type_is_compatible(blood_request, entity):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Your blood type ({entity.blood_type.value}) cannot be given to a "
                    f"{blood_request.blood_type_needed.value} recipient"
                ),
            )
        if entity.location is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Set your availability location before accepting a request",
            )

    if not _within_request_radius(blood_request, entity.location, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This request is outside the area it is currently searching",
        )


def hospital_decide(request_id: str, approve: bool, hospital: Hospital, db: Session) -> BloodRequest:
    blood_request = get_request(request_id, db)
    if blood_request.hospital_id != hospital.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request to verify")
    if blood_request.status != RequestStatus.PENDING_VERIFICATION:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request is not pending verification")

    blood_request.status = RequestStatus.ACTIVE if approve else RequestStatus.REJECTED
    db.commit()
    db.refresh(blood_request)
    return blood_request


def list_pending_for_hospital(hospital: Hospital, db: Session) -> list[BloodRequest]:
    return (
        db.query(BloodRequest)
        .filter(BloodRequest.hospital_id == hospital.id)
        .filter(BloodRequest.status == RequestStatus.PENDING_VERIFICATION)
        .all()
    )


def list_nearby_for_donor(donor: Donor, db: Session) -> list[dtos.NearbyBloodRequestOut]:
    if donor.location is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set your availability location before browsing nearby requests",
        )

    compatible_recipients = [
        recipient
        for recipient, donor_types in COMPATIBLE_DONORS_FOR_RECIPIENT.items()
        if donor.blood_type in donor_types
    ]

    # Requests this donor already has an open commitment on shouldn't show up
    # again — they can't accept twice, so listing them is just noise.
    already_committed = (
        select(RequestMatch.blood_request_id)
        .where(RequestMatch.donor_id == donor.id)
        .where(RequestMatch.status == MatchStatus.ACCEPTED)
    )

    distance_expr = (ST_Distance(BloodRequest.location, donor.location) / 1000.0).label("distance_km")
    rows = (
        db.query(BloodRequest, distance_expr)
        .filter(BloodRequest.status.in_(OPEN_STATUSES))
        .filter(BloodRequest.blood_type_needed.in_(compatible_recipients))
        .filter(ST_DWithin(BloodRequest.location, donor.location, BloodRequest.current_radius_km * 1000))
        .filter(BloodRequest.id.notin_(already_committed))
        .order_by(distance_expr.asc())
        .all()
    )

    results = []
    for blood_request, distance_km in rows:
        base = dtos.BloodRequestOut.model_validate(blood_request).model_dump()
        results.append(dtos.NearbyBloodRequestOut(**base, distance_km=round(distance_km, 2)))
    return results


def cancel_request(
    request_id: str, data: dtos.CancelRequest, db: Session, identity: Identity
) -> BloodRequest:
    blood_request = get_request(request_id, db)
    _assert_is_poster(blood_request, identity)
    if blood_request.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Request is already {blood_request.status.value} and cannot be cancelled",
        )

    blood_request.status = RequestStatus.CANCELLED
    blood_request.cancellation_reason = data.reason
    cancel_open_matches(blood_request, "Request was cancelled by the poster", db)
    db.commit()
    db.refresh(blood_request)
    return blood_request


def widen_radius(
    request_id: str, data: dtos.WidenRadiusRequest, db: Session, identity: Identity
) -> BloodRequest:
    blood_request = get_request(request_id, db)
    _assert_is_poster(blood_request, identity)
    if blood_request.status not in OPEN_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only an open request can be widened (status: {blood_request.status.value})",
        )

    # Explicit None check: `or` treated a supplied 0 as "not supplied".
    if data.to_radius_km is None:
        new_radius = blood_request.current_radius_km + RADIUS_WIDEN_STEP_KM
    else:
        new_radius = data.to_radius_km
        if new_radius < blood_request.current_radius_km:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Radius can only be widened; it is already "
                    f"{blood_request.current_radius_km} km"
                ),
            )

    blood_request.current_radius_km = min(max(new_radius, MIN_RADIUS_KM), MAX_RADIUS_KM)
    db.commit()
    db.refresh(blood_request)
    return blood_request


def reactivate_request(request_id: str, db: Session, identity: Identity) -> BloodRequest:
    """Poster manually reopens matching (e.g. a donor's ETA passed with no
    arrival) so other donors can respond again. Units already secured are
    untouched — only the request's visibility/status is reset.

    Deliberately refuses REJECTED, CANCELLED and CLOSED requests: reopening a
    hospital-rejected request would bypass verification entirely.
    """
    blood_request = get_request(request_id, db)
    _assert_is_poster(blood_request, identity)

    if blood_request.status not in REACTIVATABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {blood_request.status.value} request cannot be reactivated",
        )
    if blood_request.required_by <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The required-by time has passed; create a new request instead",
        )

    blood_request.status = _status_for_secured_units(blood_request)
    db.commit()
    db.refresh(blood_request)
    return blood_request


def close_request(
    request_id: str,
    db: Session,
    hospital: Hospital | None = None,
    identity: Identity | None = None,
) -> BloodRequest:
    blood_request = get_request(request_id, db)

    if blood_request.is_hospital_backed:
        if not hospital or blood_request.hospital_id != hospital.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the verifying hospital can close this request",
            )
    else:
        if identity is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the poster can close this request",
            )
        _assert_is_poster(blood_request, identity)

    if blood_request.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Request is already {blood_request.status.value}",
        )

    blood_request.status = RequestStatus.CLOSED
    cancel_open_matches(blood_request, "Request was closed", db)
    db.commit()
    db.refresh(blood_request)
    return blood_request


# --- Sweeps (intended for a scheduler; exposed as admin endpoints for now) --

def expire_overdue_requests(db: Session) -> int:
    """Sweep requests whose required_by has passed without a full match."""
    now = datetime.now(timezone.utc)
    overdue = (
        db.query(BloodRequest)
        .filter(BloodRequest.required_by < now)
        .filter(
            BloodRequest.status.in_(
                [
                    RequestStatus.PENDING_VERIFICATION,
                    RequestStatus.ACTIVE,
                    RequestStatus.PARTIALLY_MATCHED,
                ]
            )
        )
        .all()
    )
    for blood_request in overdue:
        blood_request.status = RequestStatus.EXPIRED
        # Otherwise these matches sit at ACCEPTED forever and keep showing up
        # in the donor's "my commitments" list.
        cancel_open_matches(blood_request, "Request expired before it was fulfilled", db)
    db.commit()
    return len(overdue)


def auto_widen_stale_requests(db: Session) -> int:
    """Widen the radius of open requests that have gone WIDEN_AFTER_MINUTES
    (per urgency) without picking up a commitment."""
    now = datetime.now(timezone.utc)
    candidates = (
        db.query(BloodRequest)
        .filter(BloodRequest.status.in_(OPEN_STATUSES))
        .filter(BloodRequest.current_radius_km < MAX_RADIUS_KM)
        .all()
    )

    widened = 0
    for blood_request in candidates:
        # Measured from the last touch, so a request isn't widened twice in
        # consecutive sweeps.
        reference = blood_request.updated_at or blood_request.created_at
        if reference is None:
            continue
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        if now - reference < timedelta(minutes=WIDEN_AFTER_MINUTES[blood_request.urgency_level]):
            continue
        if _open_match_count(blood_request, db):
            continue

        blood_request.current_radius_km = min(
            blood_request.current_radius_km + RADIUS_WIDEN_STEP_KM, MAX_RADIUS_KM
        )
        widened += 1

    db.commit()
    return widened


# --- Unit accounting ------------------------------------------------------
# None of these commit: the caller owns the transaction, which is what makes
# "reserve units + create match + open chat" succeed or fail as a whole.

def atomic_reserve_units(blood_request: BloodRequest, units: int, db: Session) -> None:
    """Atomically reserve `units` against a request's remaining capacity.

    A single conditional UPDATE guarantees that if two donors accept at the
    same instant, only one succeeds — the DB itself resolves the race, no
    application-level locking needed. The row lock it takes is held until the
    caller commits, so the match row is created under the same protection.
    """
    result = db.execute(
        update(BloodRequest)
        .where(BloodRequest.id == blood_request.id)
        .where(BloodRequest.status.in_(OPEN_STATUSES))
        .where((BloodRequest.units_needed - BloodRequest.units_secured) >= units)
        .values(units_secured=BloodRequest.units_secured + units)
        .returning(BloodRequest.units_secured)
    )
    row = result.first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Units no longer available — this request may already be fully matched or closed",
        )

    # The UPDATE bypassed the ORM, so the in-memory value is stale. Sync it,
    # because the status decision below depends on what the DB actually stored.
    new_secured = row[0]
    blood_request.units_secured = new_secured
    blood_request.status = (
        RequestStatus.FULLY_MATCHED
        if new_secured >= blood_request.units_needed
        else RequestStatus.PARTIALLY_MATCHED
    )


def release_units(blood_request: BloodRequest, units: int, db: Session) -> None:
    """Called when a donor/org cancels after accepting — frees up the units
    they had committed and reopens the request for other donors."""
    result = db.execute(
        update(BloodRequest)
        .where(BloodRequest.id == blood_request.id)
        .values(units_secured=sa_func.greatest(BloodRequest.units_secured - units, 0))
        .returning(BloodRequest.units_secured)
    )
    row = result.first()
    blood_request.units_secured = row[0] if row else 0

    if blood_request.status not in _RELEASE_LOCKED_STATUSES:
        blood_request.status = _status_for_secured_units(blood_request)


def cancel_open_matches(blood_request: BloodRequest, reason: str, db: Session) -> int:
    open_matches = (
        db.query(RequestMatch)
        .filter(RequestMatch.blood_request_id == blood_request.id)
        .filter(RequestMatch.status == MatchStatus.ACCEPTED)
        .all()
    )
    for match in open_matches:
        match.status = MatchStatus.CANCELLED
        match.cancel_reason = reason
    return len(open_matches)


def mark_fulfilled_if_complete(blood_request: BloodRequest, db: Session) -> None:
    """FULFILLED means every commitment was actually honoured — distinct from
    FULLY_MATCHED, which only means enough donors said yes."""
    if _open_match_count(blood_request, db):
        return
    if blood_request.units_secured >= blood_request.units_needed:
        blood_request.status = RequestStatus.FULFILLED


def _open_match_count(blood_request: BloodRequest, db: Session) -> int:
    return (
        db.query(RequestMatch)
        .filter(RequestMatch.blood_request_id == blood_request.id)
        .filter(RequestMatch.status == MatchStatus.ACCEPTED)
        .count()
    )


def _status_for_secured_units(blood_request: BloodRequest) -> RequestStatus:
    if blood_request.units_secured >= blood_request.units_needed:
        return RequestStatus.FULLY_MATCHED
    if blood_request.units_secured > 0:
        return RequestStatus.PARTIALLY_MATCHED
    return RequestStatus.ACTIVE


def _assert_is_poster(blood_request: BloodRequest, identity: Identity) -> None:
    entity = identity.entity
    if identity.role == "requestor" and blood_request.requestor_id == entity.id:
        return
    if identity.role == "organization" and blood_request.organization_id == entity.id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request")


# --- "poster" identity: either a Requestor or an Organization can post a
# request, so this endpoint accepts both roles rather than forcing two flows.
get_current_poster = require_roles("requestor", "organization")
