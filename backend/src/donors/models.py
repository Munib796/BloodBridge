import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from src.utils.database import Base
from src.utils.enums import BloodType
from src.utils.geo import GeographyPoint


class Donor(Base):
    __tablename__ = "donors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)

    blood_type = Column(Enum(BloodType, name="blood_type"), nullable=False)
    profile_pic_url = Column(String, nullable=True)

    # Captured once when the donor marks themselves available.
    location = Column(GeographyPoint(nullable=True), nullable=True)
    area_label = Column(String, nullable=True)

    is_email_verified = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    matches = relationship("RequestMatch", back_populates="donor")
