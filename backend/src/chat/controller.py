from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.chat import dtos
from src.chat.models import ChatMessage, ChatThread
from src.request_matches.models import RequestMatch
from src.utils.enums import SenderType


def get_thread_for_match(match_id: str, db: Session) -> ChatThread:
    thread = db.query(ChatThread).filter(ChatThread.request_match_id == match_id).first()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat thread not found")
    return thread


def assert_participant(thread: ChatThread, role: str, entity_id: str, db: Session) -> None:
    """A chat thread's only participants are the two sides of the match:
    whoever posted the request (requestor or organization) and whoever
    accepted it (donor or organization)."""
    match = db.query(RequestMatch).filter(RequestMatch.id == thread.request_match_id).first()
    blood_request = match.blood_request

    allowed = set()
    if match.donor_id:
        allowed.add(("donor", str(match.donor_id)))
    if match.organization_id:
        allowed.add(("organization", str(match.organization_id)))
    if blood_request.requestor_id:
        allowed.add(("requestor", str(blood_request.requestor_id)))
    if blood_request.organization_id:
        allowed.add(("organization", str(blood_request.organization_id)))

    if (role, str(entity_id)) not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant in this chat")


def list_messages(match_id: str, role: str, entity_id: str, db: Session) -> list[ChatMessage]:
    thread = get_thread_for_match(match_id, db)
    assert_participant(thread, role, entity_id, db)
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_thread_id == thread.id)
        .order_by(ChatMessage.sent_at.asc())
        .all()
    )


def send_message(match_id: str, role: str, entity_id: str, data: dtos.ChatMessageIn, db: Session) -> ChatMessage:
    thread = get_thread_for_match(match_id, db)
    assert_participant(thread, role, entity_id, db)

    message = ChatMessage(
        chat_thread_id=thread.id,
        sender_type=SenderType(role),
        sender_id=entity_id,
        content=data.content,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message
