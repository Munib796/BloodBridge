import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from src.utils.database import Base
from src.utils.enums import ApprovalStatus
from src.utils.geo import GeographyPoint


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    password_changed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    address = Column(String, nullable=False)
    location = Column(GeographyPoint(nullable=False), nullable=False)
    logo_url = Column(String, nullable=True)

    approval_status = Column(
        Enum(ApprovalStatus, name="approval_status_org"), default=ApprovalStatus.PENDING, nullable=False
    )
    is_email_verified = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Dual-capable: an org can both post requests and accept/donate against
    # others' requests. Both relationships exist on the same account.
    blood_requests = relationship("BloodRequest", back_populates="organization")
    matches = relationship("RequestMatch", back_populates="organization")
