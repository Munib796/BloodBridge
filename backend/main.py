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

# Import all models so Base.metadata knows about every table before
# create_all() runs. Each module is otherwise only pulled in via its router.
from src.donors import models as _donors_models  # noqa: F401
from src.requestors import models as _requestors_models  # noqa: F401
from src.hospitals import models as _hospitals_models  # noqa: F401
from src.organizations import models as _organizations_models  # noqa: F401
from src.blood_requests import models as _blood_requests_models  # noqa: F401
from src.request_matches import models as _request_matches_models  # noqa: F401
from src.chat import models as _chat_models  # noqa: F401

from src.utils.database import ensure_postgis
from src.utils.limiter import limiter

# Schema is now managed by Alembic migrations (see alembic/ and the README
# below) — run `alembic upgrade head` before starting the app. We still make
# sure the PostGIS extension exists, since migrations depend on it.
ensure_postgis()

app = FastAPI(
    title="BloodBridge",
    version="0.1.0",
    description="Real-time blood donor matching platform",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to FRONTEND_URL before production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
