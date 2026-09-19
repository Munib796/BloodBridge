import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from src.utils.constants import MAX_CHAT_MESSAGE_LENGTH
from src.utils.enums import BloodType, MatchStatus, SenderType, UrgencyLevel


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


class ChatThreadSummaryOut(BaseModel):
    """One conversation, as a chat list or a chat header needs it.

    Not `from_attributes`: the counterparty depends on which side of the match
    is asking, so it has to be resolved per viewer rather than read off the
    row. `match_id` is the id every other chat endpoint takes — message
    history, sending, and the WebSocket all key off the match, not the thread.
    """

    id: uuid.UUID
    match_id: uuid.UUID
    blood_request_id: uuid.UUID

    counterparty_name: str | None
    counterparty_role: SenderType | None

    # Enough request context to render the chat header without a second call.
    blood_type_needed: BloodType
    urgency_level: UrgencyLevel
    hospital_name: str | None
    area_label: str | None
    match_status: MatchStatus

    created_at: datetime
    last_message_at: datetime | None
    last_message_preview: str | None
