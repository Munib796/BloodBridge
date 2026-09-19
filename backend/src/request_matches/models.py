import uuid

from sqlalchemy import CheckConstraint, Column, DateTime, Enum, ForeignKey, Index, Integer, String, text
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

    __table_args__ = (
        CheckConstraint("units_committed > 0", name="ck_request_matches_units_positive"),
        CheckConstraint(
            "(donor_id IS NOT NULL AND organization_id IS NULL)"
            " OR (donor_id IS NULL AND organization_id IS NOT NULL)",
            name="ck_request_matches_one_acceptor",
        ),
        Index("ix_request_matches_blood_request_id", "blood_request_id"),
        Index("ix_request_matches_donor_id", "donor_id"),
        Index("ix_request_matches_organization_id", "organization_id"),
        # One *open* commitment per acceptor per request. Partial, so a donor
        # who cancels can legitimately accept the same request again later.
        # The enum column stores member names, hence 'ACCEPTED'.
        Index(
            "uq_request_matches_open_donor",
            "blood_request_id",
            "donor_id",
            unique=True,
            postgresql_where=text("status = 'ACCEPTED' AND donor_id IS NOT NULL"),
        ),
        Index(
            "uq_request_matches_open_organization",
            "blood_request_id",
            "organization_id",
            unique=True,
            postgresql_where=text("status = 'ACCEPTED' AND organization_id IS NOT NULL"),
        ),
    )
