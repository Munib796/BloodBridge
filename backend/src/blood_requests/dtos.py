import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from src.utils.enums import BloodType, RequestStatus, UrgencyLevel


class BloodRequestCreate(BaseModel):
    patient_name: str
    blood_type_needed: BloodType
    units_needed: int
    urgency_level: UrgencyLevel
    required_by: datetime
    hospital_name: str | None = None  # free text; matched against registered hospitals server-side
    contact_phone: str
    latitude: float
    longitude: float
    area_label: str


class BloodRequestOut(BaseModel):
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
    reason: str | None = None


class WidenRadiusRequest(BaseModel):
    # if not provided, applies the standard widen step
    to_radius_km: float | None = None
