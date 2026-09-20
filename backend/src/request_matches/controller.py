from datetime import datetime, timezone

from fastapi import HTTPException, status
from geoalchemy2.functions import ST_Distance
from sqlalchemy import func as sa_func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from src.blood_requests import controller as blood_requests_controller
from src.blood_requests.models import BloodRequest
from src.chat.models import ChatThread
from src.donors.models import Donor
from src.notifications import controller as notifications_controller
from src.organizations.models import Organization
from src.request_matches import dtos
from src.request_matches.models import RequestMatch
from src.utils.auth import Identity, require_roles
from src.utils.enums import MatchStatus, NotificationType, SenderType

# Either a Donor or an Organization can accept/fulfil a request.
get_current_acceptor = require_roles("donor", "organization")


def _display_name(entity) -> str | None:
    """Donors and requestors store `full_name`; organizations store `name`.
    One accessor, so the two shapes don't leak into every call site."""
    if entity is None:
        return None
    return getattr(entity, "full_name", None) or getattr(entity, "name", None)


def _with_participants(query):
    """Eager-load everything to_detail() reads.

    All of these are many-to-one, so the joins cannot multiply rows and the
    result needs no `.unique()`. Without them a page of N matches would issue
    a fresh lazy-load query per row for the donor, the organization, and the
    request's requestor/organization.
    """
    return query.options(
        joinedload(RequestMatch.donor),
        joinedload(RequestMatch.organization),
        joinedload(RequestMatch.blood_request).joinedload(BloodRequest.requestor),
        joinedload(RequestMatch.blood_request).joinedload(BloodRequest.organization),
    )


def _distances_for(match_ids: list, db: Session) -> dict:
    """Distance in km from each request to whoever accepted it, one query for
    the whole page.

    The acceptor is either a donor or an organization and those live in
    different tables, so this asks for both and coalesces — ST_Distance is
    STRICT, so the side that has no joined row simply yields NULL rather than
    erroring. The outer joins mean a match stays readable even if its acceptor
    row went missing.

    Geography columns measure in metres, hence the division.
    """
    if not match_ids:
        return {}

    rows = (
        db.query(
            RequestMatch.id,
            (
                sa_func.coalesce(
                    ST_Distance(BloodRequest.location, Donor.location),
                    ST_Distance(BloodRequest.location, Organization.location),
                )
                / 1000.0
            ).label("distance_km"),
        )
        .join(BloodRequest, RequestMatch.blood_request_id == BloodRequest.id)
        .outerjoin(Donor, RequestMatch.donor_id == Donor.id)
        .outerjoin(Organization, RequestMatch.organization_id == Organization.id)
        .filter(RequestMatch.id.in_(match_ids))
        .all()
    )
    return {match_id: round(distance, 2) for match_id, distance in rows if distance is not None}


def _detail(match: RequestMatch, db: Session) -> dtos.RequestMatchDetailOut:
    """The single-match variant, for the accept/eta/cancel/complete responses.
    One extra query, but it keeps those endpoints returning exactly the same
    shape as the list ones."""
    return to_detail(match, _distances_for([match.id], db).get(match.id))


def to_detail(match: RequestMatch, distance_km: float | None) -> dtos.RequestMatchDetailOut:
    """Match row -> wire format, resolving the counterparties' display names.

    Takes the distance rather than computing it, so a list endpoint can resolve
    the whole page in one query (_distances_for) instead of one per row.

    Assumes the relationships are already loadable — either eager-loaded by the
    caller (list endpoints) or lazily fetched for a single row, which is what
    the accept/eta/cancel/complete responses do.
    """
    blood_request = match.blood_request
    # Exactly one of each pair is set, enforced by ck_*_one_acceptor and
    # ck_blood_requests_one_poster.
    acceptor = match.donor or match.organization
    poster = blood_request.requestor or blood_request.organization

    return dtos.RequestMatchDetailOut(
        **dtos.RequestMatchOut.model_validate(match).model_dump(),
        acceptor_name=_display_name(acceptor),
        acceptor_phone=getattr(acceptor, "phone", None),
        poster_name=_display_name(poster),
        # The number the poster nominated for this request, which is what the
        # donor's "Call Coordinator" button should dial — not the poster's
        # account phone, which may be entirely different.
        poster_phone=blood_request.contact_phone,
        blood_request=dtos.MatchRequestSummaryOut.model_validate(blood_request),
        distance_km=distance_km,
    )


def accept_request(
    request_id: str, data: dtos.MatchAccept, db: Session, identity: Identity
) -> dtos.RequestMatchDetailOut:
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

    # One transaction for the whole accept: reserve units, create the match,
    # create the chat thread, and create the notification side-effect together.
    # If any step fails, the whole transaction rolls back and nothing persists.
    prior_units_secured = blood_request.units_secured
    prior_open_match = (
        db.query(RequestMatch.id)
        .filter(RequestMatch.blood_request_id == blood_request.id)
        .filter(RequestMatch.status == MatchStatus.ACCEPTED)
        .first()
    )

    try:
        blood_requests_controller.atomic_reserve_units(blood_request, data.units_committed, db)
        db.add(match)
        db.flush()

        remaining_before = blood_request.units_needed - prior_units_secured
        remaining_after = blood_request.units_needed - blood_request.units_secured
        is_first_accept = prior_open_match is None and remaining_after < remaining_before
        is_request_completed = remaining_before > 0 and remaining_after <= 0
        is_partial_accept = not is_first_accept and not is_request_completed

        notification_rows = []
        if is_first_accept and blood_request.requestor_id is not None:
            notification_rows.append(
                notifications_controller.create_notification(
                    recipient_id=blood_request.requestor_id,
                    recipient_role=SenderType.REQUESTOR,
                    type=NotificationType.FIRST_DONOR_ACCEPTED,
                    title="A donor is on the way",
                    body=f"A donor has accepted your request for {blood_request.blood_type_needed.value} blood.",
                    blood_request_id=blood_request.id,
                    request_match_id=match.id,
                    db=db,
                    commit=False,
                )
            )

        if is_request_completed and blood_request.requestor_id is not None:
            notification_rows.append(
                notifications_controller.create_notification(
                    recipient_id=blood_request.requestor_id,
                    recipient_role=SenderType.REQUESTOR,
                    type=NotificationType.REQUEST_COMPLETED,
                    title="All units secured",
                    body=(
                        f"Your request for {blood_request.blood_type_needed.value} blood has been fully "
                        "secured."
                    ),
                    blood_request_id=blood_request.id,
                    request_match_id=match.id,
                    db=db,
                    commit=False,
                )
            )

        if is_partial_accept and blood_request.requestor_id is not None:
            notification_rows.append(
                notifications_controller.create_notification(
                    recipient_id=blood_request.requestor_id,
                    recipient_role=SenderType.REQUESTOR,
                    type=NotificationType.PARTIAL_ACCEPT,
                    title="Another unit secured",
                    body=(
                        f"{blood_request.units_secured} of {blood_request.units_needed} units secured "
                        f"for your {blood_request.blood_type_needed.value} request."
                    ),
                    blood_request_id=blood_request.id,
                    request_match_id=match.id,
                    db=db,
                    commit=False,
                )
            )

        db.add(ChatThread(request_match_id=match.id))
        db.commit()

        for notification in notification_rows:
            notifications_controller.send_push_notification(notification, db)
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
    return _detail(match, db)


def update_eta(
    match_id: str, data: dtos.MatchUpdateEta, db: Session, identity: Identity
) -> dtos.RequestMatchDetailOut:
    match = _get_owned_match(match_id, db, identity)
    _assert_open(match)
    match.eta = data.eta
    db.commit()
    db.refresh(match)
    return _detail(match, db)


def cancel_match(
    match_id: str, data: dtos.MatchCancel, db: Session, identity: Identity
) -> dtos.RequestMatchDetailOut:
    match = _get_owned_match(match_id, db, identity)
    _assert_open(match)

    blood_request = blood_requests_controller.get_request(str(match.blood_request_id), db)

    try:
        match.status = MatchStatus.CANCELLED
        match.cancel_reason = data.reason
        # Reopens the parent request for other donors/orgs to respond to.
        blood_requests_controller.release_units(blood_request, match.units_committed, db)

        notification = None
        if blood_request.requestor_id is not None:
            body = (
                f"A donor cancelled their accepted match for {blood_request.blood_type_needed.value} blood."
            )
            if data.reason:
                body = f"{body} Reason: {data.reason}"

            notification = notifications_controller.create_notification(
                recipient_id=blood_request.requestor_id,
                recipient_role=SenderType.REQUESTOR,
                type=NotificationType.DONOR_CANCELLED,
                title="Donor cancelled",
                body=body,
                blood_request_id=blood_request.id,
                request_match_id=match.id,
                db=db,
                commit=False,
            )

        db.commit()

        if notification is not None:
            notifications_controller.send_push_notification(notification, db)
    except Exception:
        db.rollback()
        raise

    db.refresh(match)
    return _detail(match, db)


def complete_match(match_id: str, db: Session, identity: Identity) -> dtos.RequestMatchDetailOut:
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
    return _detail(match, db)


def list_my_matches(db: Session, identity: Identity) -> list[dtos.RequestMatchDetailOut]:
    """Every commitment this donor/organization holds, open or settled —
    the donor's commitment-history screen reads this."""
    query = db.query(RequestMatch)
    if identity.role == "donor":
        query = query.filter(RequestMatch.donor_id == identity.entity.id)
    else:
        query = query.filter(RequestMatch.organization_id == identity.entity.id)

    matches = _with_participants(query).order_by(RequestMatch.accepted_at.desc()).all()
    distances = _distances_for([match.id for match in matches], db)
    return [to_detail(match, distances.get(match.id)) for match in matches]


def list_matches_for_request(
    request_id: str, identity: Identity, db: Session
) -> list[dtos.RequestMatchDetailOut]:
    """Who has committed to a given request.

    Poster-facing — the requestor's detail screen lists these so they can call
    and message each donor. A donor cannot reach this list: they get their own
    commitments from list_my_matches(), and are never shown who else signed up.
    """
    blood_request = blood_requests_controller.get_request(request_id, db)
    blood_requests_controller.assert_can_view_commitments(blood_request, identity)

    matches = (
        _with_participants(
            db.query(RequestMatch).filter(RequestMatch.blood_request_id == blood_request.id)
        )
        .order_by(RequestMatch.accepted_at.desc())
        .all()
    )
    distances = _distances_for([match.id for match in matches], db)
    return [to_detail(match, distances.get(match.id)) for match in matches]


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
