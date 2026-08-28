import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from src.utils.constants import MAX_RADIUS_KM, MIN_RADIUS_KM
from src.utils.enums import BloodType, RequestStatus, UrgencyLevel
from src.utils.validators import (
    FutureDatetime,
    Label,
    Latitude,
    Longitude,
    Name,
    Phone,
    Units,
)

Radius = Annotated[float, Field(ge=MIN_RADIUS_KM, le=MAX_RADIUS_KM)]
Reason = Annotated[str, Field(max_length=500)]


class BloodRequestCreate(BaseModel):
    patient_name: Name
    blood_type_needed: BloodType
    units_needed: Units
    urgency_level: UrgencyLevel
    required_by: FutureDatetime
    hospital_name: Name | None = None  # free text; matched against registered hospitals server-side
    contact_phone: Phone
    latitude: Latitude
    longitude: Longitude
    area_label: Label


class BloodRequestOut(BaseModel):
    """Full detail, including patient name and contact number. Only returned
    to the poster, the verifying hospital, an admin, or a donor/organization
    that this request is actually reaching out to (see
    controller.assert_can_view_request)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requestor_id: uuid.UUID | None
    organization_id: uuid.UUID | None
    patient_name: str
    blood_type_needed: BloodType
    units_needed: int
    units_secured: int
    urgency_level: UrgencyLevel
    required_by: datetime
    hospital_name_text: str | None
    hospital_id: uuid.UUID | None
    is_hospital_backed: bool
    status: RequestStatus
    current_radius_km: float
    contact_phone: str
    area_label: str | None
    cancellation_reason: str | None
    created_at: datetime
    updated_at: datetime


class NearbyBloodRequestOut(BloodRequestOut):
    distance_km: float


class CancelRequest(BaseModel):
    reason: Reason | None = None


class WidenRadiusRequest(BaseModel):
    # If omitted, applies the standard widen step. Must be within the platform
    # bounds — an unbounded value used to be accepted, and a negative one made
    # the request invisible to every donor.
    to_radius_km: Radius | None = None
