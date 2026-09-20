from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.notifications import controller, dtos
from src.utils.auth import Identity, require_roles
from src.utils.database import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])
current_user = require_roles("donor", "requestor", "organization")


@router.get("", response_model=list[dtos.NotificationOut])
def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    read_at: bool | None = None,
    type: str | None = None,
    identity: Identity = Depends(current_user),
    db: Session = Depends(get_db),
):
    filters = dtos.NotificationListFilter(read_at=read_at, type=type)
    return controller.list_notifications(identity, db, limit=limit, offset=offset, filters=filters)


@router.get("/unread-count")
def unread_count(identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    return {"unread_count": controller.unread_count(identity, db)}


@router.patch("/{notification_id}/read", response_model=dtos.NotificationOut)
def mark_read(
    notification_id: str,
    identity: Identity = Depends(current_user),
    db: Session = Depends(get_db),
):
    notification = controller.get_notification(notification_id, identity, db)
    notification.read_at = datetime.utcnow()
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/read-all")
def mark_all_read(identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    count = controller.mark_all_read(identity, db)
    return {"updated_count": count}


@router.post("/read", response_model=list[dtos.NotificationOut])
def mark_many_read(
    data: list[str],
    identity: Identity = Depends(current_user),
    db: Session = Depends(get_db),
):
    return controller.mark_notifications_read(data, identity, db)
