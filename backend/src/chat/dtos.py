import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from src.utils.enums import SenderType


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chat_thread_id: uuid.UUID
    sender_type: SenderType
    sender_id: uuid.UUID
    content: str
    sent_at: datetime


class ChatMessageIn(BaseModel):
    content: str
