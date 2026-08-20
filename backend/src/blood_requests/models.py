import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from src.utils.database import Base
from src.utils.enums import BloodType, RequestStatus, UrgencyLevel
from src.utils.geo import GeographyPoint


class BloodRequest(Base):
    __tablename__ = "blood_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Exactly one of these is set — whoever posted the request.
    requestor_id = Column(UUID(as_uuid=True), ForeignKey("requestors.id"), nullable=True)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True)

    patient_name = Column(String, nullable=False)
    blood_type_needed = Column(Enum(BloodType, name="blood_type_needed"), nullable=False)
    units_needed = Column(Integer, nullable=False)
    units_secured = Column(Integer, default=0, nullable=False)

    urgency_level = Column(Enum(UrgencyLevel, name="urgency_level"), nullable=False)
    required_by = Column(DateTime(timezone=True), nullable=False)

    # Hospital-backed tracking: hospital_name_text is always what the
    # requestor typed; hospital_id is only set if that name matched a
    # registered, on-platform hospital.
    hospital_name_text = Column(String, nullable=True)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=True)
    is_hospital_backed = Column(Boolean, default=False, nullable=False)

    status = Column(Enum(RequestStatus, name="request_status"), default=RequestStatus.DRAFT, nullable=False)
    current_radius_km = Column(Float, nullable=False)

    contact_phone = Column(String, nullable=False)
    location = Column(GeographyPoint(nullable=False), nullable=False)
    area_label = Column(String, nullable=True)

    cancellation_reason = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    requestor = relationship("Requestor", back_populates="blood_requests")
    organization = relationship("Organization", back_populates="blood_requests")
    hospital = relationship("Hospital", back_populates="requests_backed")
    matches = relationship("RequestMatch", back_populates="blood_request", cascade="all, delete-orphan")
