import uuid

from sqlalchemy import JSON, Column, DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from src.utils.database import Base
from src.utils.enums import NotificationType, SenderType


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipient_id = Column(UUID(as_uuid=True), nullable=False)
    recipient_role = Column(Enum(SenderType, name="sender_type"), nullable=False)
    type = Column(Enum(NotificationType, name="notification_type"), nullable=False)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    blood_request_id = Column(UUID(as_uuid=True), ForeignKey("blood_requests.id"), nullable=True)
    request_match_id = Column(UUID(as_uuid=True), ForeignKey("request_matches.id"), nullable=True)
    payload = Column(JSON, nullable=True)
    pushed_at = Column(DateTime(timezone=True), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index(
            "ix_notifications_recipient_role_read_created",
            "recipient_id",
            "recipient_role",
            "read_at",
            "created_at",
        ),
        Index("ix_notifications_type_created", "type", "created_at"),
        Index("ix_notifications_blood_request_id", "blood_request_id"),
        Index("ix_notifications_request_match_id", "request_match_id"),
    )

    # This table is intentionally role-agnostic; the API resolves the recipient
    # from the authenticated user and returns a list filtered to that role.
