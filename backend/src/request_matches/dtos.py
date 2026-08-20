import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from src.utils.enums import MatchStatus


class MatchAccept(BaseModel):
    units_committed: int
    eta: datetime


class MatchUpdateEta(BaseModel):
    eta: datetime


class MatchCancel(BaseModel):
    reason: str | None = None


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
