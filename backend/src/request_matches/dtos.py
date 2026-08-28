import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from src.utils.enums import MatchStatus
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
