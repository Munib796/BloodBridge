from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from src.utils.settings import settings

engine = create_engine(settings.DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_postgis() -> None:
    """Create the PostGIS extension if it doesn't already exist.

    Must run once before Base.metadata.create_all(), since the
    geography columns (donor/hospital/organization/request location)
    depend on PostGIS types being registered in the database.
    """
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
