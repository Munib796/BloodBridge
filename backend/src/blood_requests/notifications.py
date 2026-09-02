"""Who should be told about a blood request.

The same matching rules as controller.list_nearby_for_donor — blood-type
compatibility plus the request's current PostGIS radius — run in the other
direction: one request in, the donors it is reaching out to out.

Nothing is actually sent yet. With no frontend there are no real device tokens
to send to, so the intent is logged and the send itself is left as a TODO at the
one call site where it belongs.
"""

import logging

from geoalchemy2.functions import ST_DWithin
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.blood_requests.models import BloodRequest
from src.donors.models import Donor
from src.request_matches.models import RequestMatch
from src.utils.constants import COMPATIBLE_DONORS_FOR_RECIPIENT, OPEN_STATUSES
from src.utils.enums import MatchStatus

logger = logging.getLogger(__name__)


def find_donors_to_notify(blood_request: BloodRequest, db: Session) -> list[Donor]:
    """Eligible, in-radius donors with a registered device token.

    Mirrors list_nearby_for_donor's filters exactly, inverted:

    * only while the request is open to donors (OPEN_STATUSES);
    * donor blood type compatible with the recipient's;
    * donor inside the request's current radius, measured by PostGIS;
    * not a donor who already holds an accepted commitment on this request —
      they can't accept twice, so notifying them is noise.

    Plus the two conditions the donor-facing feed got for free from being
    authenticated: the account is active, and it has a location to match on.
    Donors without a device_token are skipped — there is nowhere to send to.
    """
    if blood_request.status not in OPEN_STATUSES:
        return []
    if blood_request.location is None:
        return []

    compatible_donor_types = COMPATIBLE_DONORS_FOR_RECIPIENT[blood_request.blood_type_needed]

    # donor_id IS NOT NULL matters: a match row belonging to an organization has
    # a null donor_id, and `NOT IN (NULL, ...)` is never true for any row.
    already_committed = (
        select(RequestMatch.donor_id)
        .where(RequestMatch.blood_request_id == blood_request.id)
        .where(RequestMatch.status == MatchStatus.ACCEPTED)
        .where(RequestMatch.donor_id.isnot(None))
    )

    return (
        db.query(Donor)
        .filter(Donor.device_token.isnot(None))
        .filter(Donor.is_active.is_(True))
        .filter(Donor.location.isnot(None))
        .filter(Donor.blood_type.in_(compatible_donor_types))
        .filter(
            ST_DWithin(
                Donor.location, blood_request.location, blood_request.current_radius_km * 1000
            )
        )
        .filter(Donor.id.notin_(already_committed))
        .all()
    )


def notify_donors_for_request(
    blood_request: BloodRequest, db: Session, trigger: str
) -> list[Donor]:
    """Work out who to notify about `blood_request` and record the intent.

    `trigger` is just for the log line — which of the three moments this was:
    the request going active, a hospital approving it, or its radius widening.

    Call this only after the change that made the request notifiable has been
    committed, so the donor set matches what the rest of the API would return.
    """
    try:
        donors = find_donors_to_notify(blood_request, db)
    except Exception:
        # A notification must never take down the operation it belongs to — the
        # request itself is already committed by the time we get here. Roll back
        # so the caller's session is still usable (e.g. for response
        # serialisation) if the query left it in a failed transaction.
        db.rollback()
        logger.exception("Could not work out who to notify about request %s", blood_request.id)
        return []

    logger.info(
        "Would notify %d donors about request %s (%s, %s, radius %.1f km, trigger: %s)",
        len(donors),
        blood_request.id,
        blood_request.blood_type_needed.value,
        blood_request.urgency_level.value,
        blood_request.current_radius_km,
        trigger,
    )
    # TODO: integrate FCM here once device tokens are collected from the frontend
    # — send to [donor.device_token for donor in donors], and drop any token the
    # provider reports as unregistered.
    return donors
