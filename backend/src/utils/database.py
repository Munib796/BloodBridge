from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from src.utils.settings import settings

engine = create_engine(
    settings.DATABASE_URL,
    # Verify a pooled connection is still alive before handing it out —
    # without this, a DB restart or idle timeout surfaces as request errors.
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_recycle=1800,
    echo=settings.DB_ECHO,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_postgis() -> None:
    """Create the PostGIS extension if it doesn't already exist.

    Must run before any migration that creates geography columns, since
    donor/hospital/organization/request locations depend on PostGIS types
    being registered in the database.
    """
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        conn.commit()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Short-lived session for code outside the request/response cycle —
    chiefly the chat WebSocket, which must NOT hold a pooled connection open
    for the lifetime of the socket (a handful of idle chats would otherwise
    exhaust the pool and stall the whole API).
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
