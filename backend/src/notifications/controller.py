import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import requests
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.donors.models import Donor
from src.notifications import dtos
from src.notifications.models import Notification
from src.organizations.models import Organization
from src.requestors.models import Requestor
from src.utils.auth import Identity
from src.utils.enums import NotificationType, SenderType

logger = logging.getLogger(__name__)


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


def _lookup_device_token(recipient_role: SenderType, recipient_id: uuid.UUID, db: Session) -> str | None:
    if recipient_role == SenderType.REQUESTOR:
        row = db.query(Requestor).filter(Requestor.id == recipient_id).first()
        if row is None:
            return None
        return row.device_token
    if recipient_role == SenderType.DONOR:
        row = db.query(Donor).filter(Donor.id == recipient_id).first()
        if row is None:
            return None
        return row.device_token
    if recipient_role == SenderType.ORGANIZATION:
        if not hasattr(Organization, "device_token"):
            logger.warning(
                "Skipping Expo push for organization recipient %s because Organization.device_token does not exist",
                recipient_id,
            )
            return None
        row = db.query(Organization).filter(Organization.id == recipient_id).first()
        if row is None:
            return None
        return row.device_token
    return None


def send_push_notification(notification: Notification, db: Session) -> None:
    token = _lookup_device_token(notification.recipient_role, notification.recipient_id, db)
    if not token or not str(token).strip():
        return

    payload = {
        "to": token,
        "title": notification.title,
        "body": notification.body,
        "data": {
            "notification_id": str(notification.id),
            "blood_request_id": str(notification.blood_request_id) if notification.blood_request_id else None,
            "request_match_id": str(notification.request_match_id) if notification.request_match_id else None,
            "type": notification.type.value,
        },
    }

    logger.info("Attempting Expo push for notification %s payload=%s", notification.id, payload)

    try:
        response = requests.post(
            "https://exp.host/--/api/v2/push/send",
            json=payload,
            timeout=5,
        )
        response_body = response.json()
        logger.info(
            "Expo push response for notification %s status=%s body=%s",
            notification.id,
            response.status_code,
            response_body,
        )
        ticket = response_body.get("data", {}) if isinstance(response_body, dict) else {}
        if 200 <= response.status_code < 300 and ticket.get("status") == "ok":
            notification.pushed_at = datetime.now(timezone.utc)
            db.commit()
            return
        logger.warning(
            "Expo push was not accepted for notification %s status=%s body=%s",
            notification.id,
            response.status_code,
            response_body,
        )
    except Exception:
        logger.exception("Expo push failed for notification %s", notification.id)


def unread_count(identity: Identity, db: Session) -> int:
    return (
        db.query(Notification)
        .filter(Notification.recipient_id == uuid.UUID(identity.id))
        .filter(Notification.recipient_role == SenderType(identity.role))
        .filter(Notification.read_at.is_(None))
        .count()
    )
