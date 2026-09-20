import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.notifications import dtos
from src.notifications.models import Notification
from src.utils.auth import Identity
from src.utils.enums import NotificationType, SenderType


def list_notifications(
    identity: Identity,
    db: Session,
    limit: int = 50,
    offset: int = 0,
    filters: dtos.NotificationListFilter | None = None,
) -> list[Notification]:
    query = (
        db.query(Notification)
        .filter(Notification.recipient_id == uuid.UUID(identity.id))
        .filter(Notification.recipient_role == SenderType(identity.role))
    )
    if filters is not None:
        if filters.read_at is not None:
            if filters.read_at:
                query = query.filter(Notification.read_at.is_not(None))
            else:
                query = query.filter(Notification.read_at.is_(None))
        if filters.type is not None:
            query = query.filter(Notification.type == filters.type)
    return query.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()


def get_notification(notification_id: str, identity: Identity, db: Session) -> Notification:
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id)
        .filter(Notification.recipient_id == uuid.UUID(identity.id))
        .filter(Notification.recipient_role == SenderType(identity.role))
        .first()
    )
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return notification


def mark_notifications_read(notification_ids: list[str], identity: Identity, db: Session) -> list[Notification]:
    if not notification_ids:
        return []
    notification_uuids = [uuid.UUID(item) for item in notification_ids]
    rows = (
        db.query(Notification)
        .filter(Notification.id.in_(notification_uuids))
        .filter(Notification.recipient_id == uuid.UUID(identity.id))
        .filter(Notification.recipient_role == SenderType(identity.role))
        .all()
    )
    for row in rows:
        row.read_at = datetime.utcnow()
    db.commit()
    return rows


def mark_all_read(identity: Identity, db: Session) -> int:
    updated = (
        db.query(Notification)
        .filter(Notification.recipient_id == uuid.UUID(identity.id))
        .filter(Notification.recipient_role == SenderType(identity.role))
        .filter(Notification.read_at.is_(None))
        .update({Notification.read_at: func.now()}, synchronize_session=False)
    )
    db.commit()
    return updated


def create_notification(
    *,
    recipient_id: uuid.UUID,
    recipient_role: SenderType,
    type: NotificationType,
    title: str,
    body: str,
    blood_request_id: uuid.UUID | None = None,
    request_match_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
    pushed_at: datetime | None = None,
    db: Session,
    commit: bool = True,
) -> Notification:
    row = Notification(
        recipient_id=recipient_id,
        recipient_role=recipient_role,
        type=type,
        title=title,
        body=body,
        blood_request_id=blood_request_id,
        request_match_id=request_match_id,
        payload=payload,
        pushed_at=pushed_at,
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
        return row
    db.flush()
    return row


def unread_count(identity: Identity, db: Session) -> int:
    return (
        db.query(Notification)
        .filter(Notification.recipient_id == uuid.UUID(identity.id))
        .filter(Notification.recipient_role == SenderType(identity.role))
        .filter(Notification.read_at.is_(None))
        .count()
    )
