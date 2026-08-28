import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from src.utils.constants import MAX_CHAT_MESSAGE_LENGTH
from src.utils.enums import SenderType


def _not_blank(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("Message must not be empty")
    return stripped


MessageBody = Annotated[
    str, Field(min_length=1, max_length=MAX_CHAT_MESSAGE_LENGTH), AfterValidator(_not_blank)
]


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chat_thread_id: uuid.UUID
    sender_type: SenderType
    sender_id: uuid.UUID
    content: str
    sent_at: datetime


class ChatMessageIn(BaseModel):
    content: MessageBody
