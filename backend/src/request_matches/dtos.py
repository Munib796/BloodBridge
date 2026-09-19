import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from src.utils.enums import BloodType, MatchStatus, RequestStatus, UrgencyLevel
from src.utils.validators import FutureDatetime, Units

Reason = Annotated[str, Field(max_length=500)]


class MatchAccept(BaseModel):
    units_committed: Units
    eta: FutureDatetime


class MatchUpdateEta(BaseModel):
    eta: FutureDatetime


class MatchCancel(BaseModel):
    reason: Reason | None = None


class RequestMatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    blood_request_id: uuid.UUID
    donor_id: uuid.UUID | None
    organization_id: uuid.UUID | None
    units_committed: int
    eta: datetime | None
    status: MatchStatus
    cancel_reason: str | None
    accepted_at: datetime
    completed_at: datetime | None


class MatchRequestSummaryOut(BaseModel):
    """The blood request a commitment belongs to, trimmed to what the two
    participants need in order to render it.

    Patient name is included because both sides are already entitled to it:
    accepting a request grants the acceptor permanent visibility of its
    details (blood_requests.controller.assert_can_view_request). The raw
    coordinates are not — nothing in the app plots a match on a map.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_name: str
    blood_type_needed: BloodType
    units_needed: int
    units_secured: int
    urgency_level: UrgencyLevel
    status: RequestStatus
    required_by: datetime
    hospital_name_text: str | None
    is_hospital_backed: bool
    current_radius_km: float
    area_label: str | None


class RequestMatchDetailOut(RequestMatchOut):
    """A commitment plus the two participants' contact details.

    Both sides of a match are meant to reach each other — that is the point of
    the match, and there is a chat thread per match for exactly that. So the
    acceptor's (the donor's or organization's) and the poster's name and phone
    travel together here, rather than being fetched by a second call.

    Naming note: `poster_*` is the requestor/organization that created the
    request and `acceptor_*` is whoever committed to it, which is the pair the
    UI calls "coordinator" and "donor". Every endpoint returning this DTO is
    already scoped to one of those two, so neither party learns anything about
    a stranger.
    """

    acceptor_name: str | None
    acceptor_phone: str | None
    poster_name: str | None
    poster_phone: str
    blood_request: MatchRequestSummaryOut

    # Straight-line distance from the request to whoever accepted it, in km —
    # "1.8 km away" on the donor's commitment card, and equally meaningful to
    # the poster as "this donor is 1.8 km from the patient". Nullable because
    # it needs a location on both sides; in practice a donor must have one to
    # pass assert_acceptor_eligible, and organizations always do.
    distance_km: float | None
