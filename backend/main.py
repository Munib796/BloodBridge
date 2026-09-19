import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.admin.router import router as admin_router
from src.blood_requests.router import router as blood_requests_router
from src.chat.router import router as chat_router
from src.donors.router import router as donors_router
from src.hospitals.router import router as hospitals_router
from src.organizations.router import router as organizations_router
from src.request_matches.router import router as request_matches_router
from src.requestors.router import router as requestors_router

# Import all models so Base.metadata knows about every table. Each module is
# otherwise only pulled in via its router.
from src.donors import models as _donors_models  # noqa: F401
from src.requestors import models as _requestors_models  # noqa: F401
from src.hospitals import models as _hospitals_models  # noqa: F401
from src.organizations import models as _organizations_models  # noqa: F401
from src.blood_requests import models as _blood_requests_models  # noqa: F401
from src.request_matches import models as _request_matches_models  # noqa: F401
from src.chat import models as _chat_models  # noqa: F401

from src.utils.database import ensure_postgis
from src.utils.limiter import limiter
from src.utils.scheduler import shutdown_scheduler, start_scheduler
from src.utils.settings import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Schema itself is managed by Alembic (`alembic upgrade head`); we only
    make sure the PostGIS extension exists, since migrations depend on it, then
    start the timer that runs the expire-overdue / auto-widen sweeps.

    This runs on startup rather than at import time — importing the module used
    to require a live database, which broke tests and offline schema dumps, and
    it is also why the scheduler starts here: importing the app must never
    leave a background timer running behind it.
    """
    try:
        ensure_postgis()
    except Exception:
        logger.exception("Could not verify the PostGIS extension — is the database reachable?")
        raise

    start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(
    title="BloodBridge",
    version="0.1.0",
    description="Real-time blood donor matching platform",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Explicit origins, not "*": the previous wildcard-plus-credentials pair is
# rejected outright by browsers, and the API authenticates with bearer tokens
# so cookie credentials aren't needed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(donors_router)
app.include_router(requestors_router)
app.include_router(hospitals_router)
app.include_router(organizations_router)
app.include_router(admin_router)
app.include_router(blood_requests_router)
app.include_router(request_matches_router)
app.include_router(chat_router)


@app.get("/", tags=["health"], summary="Service health")
async def root():
    return {"service": "BloodBridge", "status": "ok"}
