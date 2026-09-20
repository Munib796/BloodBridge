import uuid
from collections.abc import Callable

from fastapi import HTTPException, status
from sqlalchemy import func as sa_func
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from src.blood_requests.models import BloodRequest
from src.chat import dtos
from src.chat.models import ChatMessage, ChatThread
from src.notifications import controller as notifications_controller
from src.request_matches.models import RequestMatch
from src.utils.auth import Identity, require_roles
from src.utils.enums import NotificationType, SenderType

# Only the two sides of a match can chat, so only they have threads to list.
# A hospital named on a request is not a participant (see assert_participant).
get_current_chat_participant = require_roles("donor", "requestor", "organization")

# Long enough to see the gist of a message, short enough that a 2000-character
# one doesn't get rendered in a list row.
MESSAGE_PREVIEW_LENGTH = 120


def get_thread_for_match(match_id: str, db: Session) -> ChatThread:
    thread = db.query(ChatThread).filter(ChatThread.request_match_id == match_id).first()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat thread not found")
    return thread


def assert_participant(thread: ChatThread, identity: Identity, db: Session) -> None:
    """A chat thread's only participants are the two sides of the match:
    whoever posted the request (requestor or organization) and whoever
    accepted it (donor or organization)."""
    match = db.query(RequestMatch).filter(RequestMatch.id == thread.request_match_id).first()
    if match is None or match.blood_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat thread not found")

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

    if (identity.role, str(identity.id)) not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant in this chat")


def list_messages(match_id: str, identity: Identity, db: Session) -> list[ChatMessage]:
    thread = get_thread_for_match(match_id, db)
    assert_participant(thread, identity, db)
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_thread_id == thread.id)
        .order_by(ChatMessage.sent_at.asc())
        .all()
    )


def _message_preview(content: str) -> str:
    preview = content.strip()
    if len(preview) > MESSAGE_PREVIEW_LENGTH:
        preview = preview[: MESSAGE_PREVIEW_LENGTH - 1].rstrip() + "…"
    return preview


def _recipient_for_chat_message(
    thread: ChatThread, sender_id: uuid.UUID | str, sender_type: SenderType
) -> tuple[uuid.UUID, SenderType]:
    match = thread.request_match
    if match is None or match.blood_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat thread not found")

    acceptor_id = match.donor_id or match.organization_id
    poster_id = match.blood_request.requestor_id or match.blood_request.organization_id
    sender_key = str(sender_id)

    # The thread has exactly two sides: the acceptor and the poster. We notify
    # the participant on the other side of the match, regardless of whether they
    # were a donor or organization.
    if sender_key == str(acceptor_id) and sender_type in {SenderType.DONOR, SenderType.ORGANIZATION}:
        if match.blood_request.requestor_id is not None:
            return match.blood_request.requestor_id, SenderType.REQUESTOR
        if match.blood_request.organization_id is not None:
            return match.blood_request.organization_id, SenderType.ORGANIZATION
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Request poster not found")

    if sender_key == str(poster_id) and sender_type in {SenderType.REQUESTOR, SenderType.ORGANIZATION}:
        if match.donor_id is not None:
            return match.donor_id, SenderType.DONOR
        if match.organization_id is not None:
            return match.organization_id, SenderType.ORGANIZATION
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Match acceptor not found")

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account cannot notify this chat")


def send_message(
    match_id: str,
    identity: Identity,
    data: dtos.ChatMessageIn,
    db: Session,
    is_recipient_connected: Callable[[str, str], bool] | None = None,
) -> ChatMessage:
    thread = get_thread_for_match(match_id, db)
    assert_participant(thread, identity, db)

    try:
        sender_type = SenderType(identity.role)
    except ValueError:
        # assert_participant already restricts to donor/requestor/organization;
        # this is a guard against a future role being let through by accident.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account type cannot post messages"
        )

    message = ChatMessage(
        chat_thread_id=thread.id,
        sender_type=sender_type,
        sender_id=identity.entity.id,
        content=data.content,
    )
    db.add(message)

    recipient_id, recipient_role = _recipient_for_chat_message(thread, identity.entity.id, sender_type)
    notification = notifications_controller.create_notification(
        recipient_id=recipient_id,
        recipient_role=recipient_role,
        type=NotificationType.NEW_CHAT_MESSAGE,
        title="New message",
        body=_message_preview(data.content),
        blood_request_id=thread.request_match.blood_request_id,
        request_match_id=thread.request_match_id,
        db=db,
        commit=False,
    )

    db.commit()

    recipient_is_connected = (
        is_recipient_connected is not None
        and is_recipient_connected(match_id, str(recipient_id))
    )
    if not recipient_is_connected:
        notifications_controller.send_push_notification(notification, db)

    db.refresh(message)
    return message


# --- Listing ---------------------------------------------------------------

def _participant_filter(identity: Identity):
    """assert_participant()'s rule expressed as a SQL predicate, so the list
    query never has to load a thread it would then reject.

    A match has two sides: whoever accepted it (donor_id or organization_id)
    and whoever posted the request. An organization can legitimately be either
    one, which is why it appears on both sides of the OR.
    """
    me = identity.entity.id
    if identity.role == "donor":
        return RequestMatch.donor_id == me
    if identity.role == "requestor":
        return BloodRequest.requestor_id == me
    return or_(
        RequestMatch.organization_id == me,
        BloodRequest.organization_id == me,
    )


def _display_name(entity) -> str | None:
    if entity is None:
        return None
    return getattr(entity, "full_name", None) or getattr(entity, "name", None)


def _counterparty(match: RequestMatch, viewer: Identity) -> tuple[str | None, SenderType]:
    """Who is on the other end of this thread, and what role they hold.

    The role matters to the client: it labels incoming vs. outgoing bubbles by
    comparing a message's sender_type against the viewer's own role.
    """
    blood_request = match.blood_request
    me = viewer.id

    viewer_is_acceptor = (viewer.role == "donor" and str(match.donor_id) == me) or (
        viewer.role == "organization" and str(match.organization_id) == me
    )

    if viewer_is_acceptor:
        # The other side is whoever posted the request.
        if blood_request.requestor_id is not None:
            return _display_name(blood_request.requestor), SenderType.REQUESTOR
        return _display_name(blood_request.organization), SenderType.ORGANIZATION

    if match.donor_id is not None:
        return _display_name(match.donor), SenderType.DONOR
    return _display_name(match.organization), SenderType.ORGANIZATION


def _last_messages(thread_ids: list, db: Session) -> dict:
    """Newest message per thread, in one query for the whole page.

    `DISTINCT ON` is PostgreSQL-specific, which this schema already is (PostGIS
    geography columns, native ENUM types). Loading every thread's messages and
    slicing in Python would pull a conversation's entire history to show one
    line of it.
    """
    if not thread_ids:
        return {}

    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_thread_id.in_(thread_ids))
        .distinct(ChatMessage.chat_thread_id)
        # DISTINCT ON requires the leading ORDER BY terms to match its
        # expression; sent_at desc picks the newest, and id breaks ties when a
        # burst of messages shares one transaction timestamp.
        .order_by(ChatMessage.chat_thread_id, ChatMessage.sent_at.desc(), ChatMessage.id.desc())
        .all()
    )
    return {row.chat_thread_id: row for row in rows}


def _to_summary(
    thread: ChatThread, viewer: Identity, last_message: ChatMessage | None
) -> dtos.ChatThreadSummaryOut:
    match = thread.request_match
    blood_request = match.blood_request
    counterparty_name, counterparty_role = _counterparty(match, viewer)

    preview = last_message.content.strip() if last_message is not None else None
    if preview is not None and len(preview) > MESSAGE_PREVIEW_LENGTH:
        preview = preview[: MESSAGE_PREVIEW_LENGTH - 1].rstrip() + "…"

    return dtos.ChatThreadSummaryOut(
        id=thread.id,
        match_id=match.id,
        blood_request_id=blood_request.id,
        counterparty_name=counterparty_name,
        counterparty_role=counterparty_role,
        blood_type_needed=blood_request.blood_type_needed,
        urgency_level=blood_request.urgency_level,
        hospital_name=blood_request.hospital_name_text,
        area_label=blood_request.area_label,
        match_status=match.status,
        created_at=thread.created_at,
        last_message_at=last_message.sent_at if last_message is not None else None,
        last_message_preview=preview,
    )


def list_my_threads(
    identity: Identity, db: Session, limit: int = 50, offset: int = 0
) -> list[dtos.ChatThreadSummaryOut]:
    """Every conversation this account is a participant in, most recently
    active first.

    A thread is created with the match that causes it, so this covers the same
    commitments as GET /request-matches/mine — but carries the counterparty and
    the request context, which is what the chat screen needs to render before a
    single message has been sent.
    """
    last_sent_at = (
        select(sa_func.max(ChatMessage.sent_at))
        .where(ChatMessage.chat_thread_id == ChatThread.id)
        .correlate(ChatThread)
        .scalar_subquery()
    )

    threads = (
        db.query(ChatThread)
        # The explicit joins exist to filter on the other side of the match;
        # the joinedloads below are separate (aliased) joins that populate the
        # relationships for serialisation. Using contains_eager to share one
        # join is possible, but it couples the filter and the fetch in a way
        # that breaks quietly the moment either changes.
        .join(RequestMatch, ChatThread.request_match_id == RequestMatch.id)
        .join(BloodRequest, RequestMatch.blood_request_id == BloodRequest.id)
        .filter(_participant_filter(identity))
        .options(
            joinedload(ChatThread.request_match).joinedload(RequestMatch.donor),
            joinedload(ChatThread.request_match).joinedload(RequestMatch.organization),
            joinedload(ChatThread.request_match)
            .joinedload(RequestMatch.blood_request)
            .joinedload(BloodRequest.requestor),
            joinedload(ChatThread.request_match)
            .joinedload(RequestMatch.blood_request)
            .joinedload(BloodRequest.organization),
        )
        # Ordering and paging happen in SQL rather than in Python: a thread
        # with no messages yet falls back to when it was opened, so a brand-new
        # conversation doesn't sink below every chat that has a message in it.
        .order_by(
            sa_func.coalesce(last_sent_at, ChatThread.created_at).desc(),
            ChatThread.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    last_messages = _last_messages([thread.id for thread in threads], db)
    return [
        _to_summary(thread, identity, last_messages.get(thread.id)) for thread in threads
    ]

