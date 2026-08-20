import uuid

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from src.utils.database import Base
from src.utils.enums import SenderType


class ChatThread(Base):
    __tablename__ = "chat_threads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_match_id = Column(UUID(as_uuid=True), ForeignKey("request_matches.id"), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    request_match = relationship("RequestMatch", back_populates="chat_thread")
    messages = relationship("ChatMessage", back_populates="chat_thread", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_thread_id = Column(UUID(as_uuid=True), ForeignKey("chat_threads.id"), nullable=False)

    sender_type = Column(Enum(SenderType, name="sender_type"), nullable=False)
    sender_id = Column(UUID(as_uuid=True), nullable=False)
    content = Column(Text, nullable=False)

    sent_at = Column(DateTime(timezone=True), server_default=func.now())

    chat_thread = relationship("ChatThread", back_populates="messages")
