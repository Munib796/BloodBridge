from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from geoalchemy2.functions import ST_DWithin, ST_Distance
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from src.blood_requests import dtos
from src.blood_requests.models import BloodRequest
from src.donors.models import Donor
from src.hospitals.models import Hospital
from src.organizations.models import Organization
from src.requestors.models import Requestor
from src.utils.constants import (
    COMPATIBLE_DONORS_FOR_RECIPIENT,
    DEFAULT_RADIUS_KM,
    MAX_RADIUS_KM,
    RADIUS_WIDEN_STEP_KM,
)
from src.utils.enums import ApprovalStatus, RequestStatus
from src.utils.database import get_db
from src.utils.geo import make_point
from src.utils.helpers import decode_token
from sqlalchemy import update


def _find_registered_hospital(hospital_name: str | None, db: Session) -> Hospital | None:
    if not hospital_name:
        return None
    return (
        db.query(Hospital)
        .filter(sa_func.lower(Hospital.name) == hospital_name.strip().lower())
        .filter(Hospital.approval_status == ApprovalStatus.APPROVED)
        .first()
    )


def create_request(
    data: dtos.BloodRequestCreate,
    db: Session,
    requestor: Requestor | None = None,
    organization: Organization | None = None,
) -> BloodRequest:
    hospital = _find_registered_hospital(data.hospital_name, db)
    is_hospital_backed = hospital is not None

    blood_request = BloodRequest(
        requestor_id=requestor.id if requestor else None,
        organization_id=organization.id if organization else None,
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
    blood_request = db.query(BloodRequest).filter(BloodRequest.id == request_id).first()
    if not blood_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return blood_request


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
        recipient for recipient, donor_types in COMPATIBLE_DONORS_FOR_RECIPIENT.items()
        if donor.blood_type in donor_types
    ]

    distance_expr = (ST_Distance(BloodRequest.location, donor.location) / 1000.0).label("distance_km")
    rows = (
        db.query(BloodRequest, distance_expr)
        .filter(BloodRequest.status.in_([RequestStatus.ACTIVE, RequestStatus.PARTIALLY_MATCHED]))
        .filter(BloodRequest.blood_type_needed.in_(compatible_recipients))
        .filter(ST_DWithin(BloodRequest.location, donor.location, BloodRequest.current_radius_km * 1000))
        .order_by(distance_expr.asc())
        .all()
    )

    results = []
    for blood_request, distance_km in rows:
        base = dtos.BloodRequestOut.model_validate(blood_request).model_dump()
        results.append(dtos.NearbyBloodRequestOut(**base, distance_km=round(distance_km, 2)))
    return results


def cancel_request(
    request_id: str,
    data: dtos.CancelRequest,
    db: Session,
    requestor: Requestor | None = None,
    organization: Organization | None = None,
) -> BloodRequest:
    blood_request = get_request(request_id, db)
    _assert_is_poster(blood_request, requestor, organization)
    if blood_request.status in (RequestStatus.CLOSED, RequestStatus.CANCELLED, RequestStatus.REJECTED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request cannot be cancelled")

    blood_request.status = RequestStatus.CANCELLED
    blood_request.cancellation_reason = data.reason
    db.commit()
    db.refresh(blood_request)
    return blood_request


def widen_radius(
    request_id: str,
    data: dtos.WidenRadiusRequest,
    db: Session,
    requestor: Requestor | None = None,
    organization: Organization | None = None,
) -> BloodRequest:
    blood_request = get_request(request_id, db)
    _assert_is_poster(blood_request, requestor, organization)

    new_radius = data.to_radius_km or (blood_request.current_radius_km + RADIUS_WIDEN_STEP_KM)
    blood_request.current_radius_km = min(new_radius, MAX_RADIUS_KM)
    db.commit()
    db.refresh(blood_request)
    return blood_request


def reactivate_request(
    request_id: str,
    db: Session,
    requestor: Requestor | None = None,
    organization: Organization | None = None,
) -> BloodRequest:
    """Requestor manually reopens matching (e.g. donor's EAT passed with no
    arrival) so other donors can respond again. Units already secured are
    untouched — only the request's visibility/status is reset."""
    blood_request = get_request(request_id, db)
    _assert_is_poster(blood_request, requestor, organization)

    if blood_request.units_secured >= blood_request.units_needed:
        blood_request.status = RequestStatus.FULLY_MATCHED
    elif blood_request.units_secured > 0:
        blood_request.status = RequestStatus.PARTIALLY_MATCHED
    else:
        blood_request.status = RequestStatus.ACTIVE
    db.commit()
    db.refresh(blood_request)
    return blood_request


def close_request(
    request_id: str,
    db: Session,
    hospital: Hospital | None = None,
    requestor: Requestor | None = None,
    organization: Organization | None = None,
) -> BloodRequest:
    blood_request = get_request(request_id, db)

    if blood_request.is_hospital_backed:
        if not hospital or blood_request.hospital_id != hospital.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the verifying hospital can close this request")
    else:
        _assert_is_poster(blood_request, requestor, organization)

    if blood_request.status in (RequestStatus.CLOSED, RequestStatus.CANCELLED, RequestStatus.REJECTED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request already in a terminal state")

    blood_request.status = RequestStatus.CLOSED
    db.commit()
    db.refresh(blood_request)
    return blood_request


def expire_overdue_requests(db: Session) -> int:
    """Sweep requests whose required_by has passed with no full match yet.
    Intended to be called by a scheduler/cron (Phase 2); exposed here as a
    plain function so it can also be triggered manually for MVP."""
    now = datetime.now(timezone.utc)
    overdue = (
        db.query(BloodRequest)
        .filter(BloodRequest.required_by < now)
        .filter(BloodRequest.status.in_([
            RequestStatus.PENDING_VERIFICATION,
            RequestStatus.ACTIVE,
            RequestStatus.PARTIALLY_MATCHED,
        ]))
        .all()
    )
    for blood_request in overdue:
        blood_request.status = RequestStatus.EXPIRED
    db.commit()
    return len(overdue)


def _assert_is_poster(blood_request: BloodRequest, requestor: Requestor | None, organization: Organization | None) -> None:
    is_owner = (requestor and blood_request.requestor_id == requestor.id) or (
        organization and blood_request.organization_id == organization.id
    )
    if not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your request")


def atomic_reserve_units(request_id: str, units: int, db: Session) -> BloodRequest:
    """Atomically reserve `units` against a request's remaining capacity.
    A single conditional UPDATE guarantees that if two donors accept at the
    same instant, only one succeeds — the DB itself resolves the race,
    no application-level locking needed."""
    result = db.execute(
        update(BloodRequest)
        .where(BloodRequest.id == request_id)
        .where(BloodRequest.status.in_([RequestStatus.ACTIVE, RequestStatus.PARTIALLY_MATCHED]))
        .where((BloodRequest.units_needed - BloodRequest.units_secured) >= units)
        .values(units_secured=BloodRequest.units_secured + units)
        .returning(BloodRequest.id)
    )
    row = result.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Units no longer available — this request may already be fully matched or closed",
        )

    blood_request = db.query(BloodRequest).filter(BloodRequest.id == request_id).first()
    blood_request.status = (
        RequestStatus.FULLY_MATCHED
        if blood_request.units_secured >= blood_request.units_needed
        else RequestStatus.PARTIALLY_MATCHED
    )
    db.commit()
    db.refresh(blood_request)
    return blood_request


def release_units(request_id: str, units: int, db: Session) -> BloodRequest:
    """Called when a donor/org cancels after accepting — frees up the units
    they had committed and reopens the request for other donors."""
    blood_request = get_request(request_id, db)
    blood_request.units_secured = max(0, blood_request.units_secured - units)
    if blood_request.status not in (
        RequestStatus.CLOSED, RequestStatus.CANCELLED, RequestStatus.REJECTED, RequestStatus.EXPIRED,
    ):
        blood_request.status = (
            RequestStatus.PARTIALLY_MATCHED if blood_request.units_secured > 0 else RequestStatus.ACTIVE
        )
    db.commit()
    db.refresh(blood_request)
    return blood_request


# --- "poster" identity: either a Requestor or an Organization can post a
# request. Decode the bearer token generically and branch on its role
# claim, rather than requiring two separate login flows for this endpoint.
oauth2_scheme_any = OAuth2PasswordBearer(tokenUrl="requestors/login", auto_error=False)


def get_current_poster(token: str = Depends(oauth2_scheme_any), db: Session = Depends(get_db)) -> dict:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(token)
    if payload.get("purpose") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    role = payload.get("role")
    if role == "requestor":
        requestor = db.query(Requestor).filter(Requestor.id == payload["id"]).first()
        if not requestor:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Requestor not found")
        return {"requestor": requestor, "organization": None}
    if role == "organization":
        org = db.query(Organization).filter(Organization.id == payload["id"]).first()
        if not org:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Organization not found")
        return {"requestor": None, "organization": org}

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only requestors or organizations can post requests")
