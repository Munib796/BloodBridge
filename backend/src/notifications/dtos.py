import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from src.utils.enums import NotificationType, SenderType


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    recipient_id: uuid.UUID
    recipient_role: SenderType
    type: NotificationType
    title: str
    body: str
    blood_request_id: uuid.UUID | None = None
    request_match_id: uuid.UUID | None = None
    payload: dict | None = None
    pushed_at: datetime | None = None
    read_at: datetime | None = None
    created_at: datetime


class NotificationListFilter(BaseModel):
    read_at: bool | None = None
    type: NotificationType | None = None


class NotificationReadUpdate(BaseModel):
    read_at: datetime | None
