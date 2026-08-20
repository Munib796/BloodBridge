import uuid

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from src.utils.database import Base
from src.utils.enums import MatchStatus


class RequestMatch(Base):
    __tablename__ = "request_matches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blood_request_id = Column(UUID(as_uuid=True), ForeignKey("blood_requests.id"), nullable=False)

    # Exactly one of these is set — whoever accepted/committed to donate.
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), nullable=True)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True)

    units_committed = Column(Integer, nullable=False)
    eta = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(MatchStatus, name="match_status"), default=MatchStatus.ACCEPTED, nullable=False)
    cancel_reason = Column(String, nullable=True)

    accepted_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    blood_request = relationship("BloodRequest", back_populates="matches")
    donor = relationship("Donor", back_populates="matches")
    organization = relationship("Organization", back_populates="matches")
    chat_thread = relationship("ChatThread", back_populates="request_match", uselist=False, cascade="all, delete-orphan")
