import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from src.utils.database import Base
from src.utils.enums import ApprovalStatus
from src.utils.geo import GeographyPoint


class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)

    address = Column(String, nullable=False)
    location = Column(GeographyPoint(nullable=False), nullable=False)
    logo_url = Column(String, nullable=True)

    approval_status = Column(
        Enum(ApprovalStatus, name="approval_status"), default=ApprovalStatus.PENDING, nullable=False
    )
    is_email_verified = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    requests_backed = relationship("BloodRequest", back_populates="hospital")
