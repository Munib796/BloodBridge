from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.admin.controller import get_current_admin
from src.blood_requests import controller, dtos
from src.blood_requests.controller import get_current_poster
from src.donors.controller import get_current_donor
from src.donors.models import Donor
from src.hospitals.controller import get_current_hospital
from src.hospitals.models import Hospital
from src.utils.auth import Identity, get_current_identity
from src.utils.database import get_db

router = APIRouter(prefix="/blood-requests", tags=["blood_requests"])


@router.post("", response_model=dtos.BloodRequestOut, status_code=201)
def create_request(
    data: dtos.BloodRequestCreate,
    poster: Identity = Depends(get_current_poster),
    db: Session = Depends(get_db),
):
    return controller.create_request(data, db, poster)


# Specific paths are declared before /{request_id} so the intent is obvious,
# even though a single-segment param wouldn't shadow them.

@router.get("/nearby/for-me", response_model=list[dtos.NearbyBloodRequestOut])
def list_nearby_for_donor(donor: Donor = Depends(get_current_donor), db: Session = Depends(get_db)):
    return controller.list_nearby_for_donor(donor, db)


@router.get("/hospital/pending", response_model=list[dtos.BloodRequestOut])
def list_pending_for_hospital(hospital: Hospital = Depends(get_current_hospital), db: Session = Depends(get_db)):
    return controller.list_pending_for_hospital(hospital, db)


@router.get("/{request_id}", response_model=dtos.BloodRequestOut)
def get_request(
    request_id: str,
    identity: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    """Patient name and contact number are only returned to the poster, the
    verifying hospital, an admin, or a donor/organization this request is
    actually reaching out to. Everyone else gets a 404."""
    return controller.get_request_for_viewer(request_id, identity, db)


@router.patch("/{request_id}/hospital-verify", response_model=dtos.BloodRequestOut)
def hospital_verify(
    request_id: str,
    approve: bool,
    hospital: Hospital = Depends(get_current_hospital),
    db: Session = Depends(get_db),
):
    return controller.hospital_decide(request_id, approve, hospital, db)


@router.patch("/{request_id}/cancel", response_model=dtos.BloodRequestOut)
def cancel_request(
    request_id: str,
    data: dtos.CancelRequest,
    poster: Identity = Depends(get_current_poster),
    db: Session = Depends(get_db),
):
    return controller.cancel_request(request_id, data, db, poster)


@router.patch("/{request_id}/widen-radius", response_model=dtos.BloodRequestOut)
def widen_radius(
    request_id: str,
    data: dtos.WidenRadiusRequest,
    poster: Identity = Depends(get_current_poster),
    db: Session = Depends(get_db),
):
    return controller.widen_radius(request_id, data, db, poster)


@router.patch("/{request_id}/reactivate", response_model=dtos.BloodRequestOut)
def reactivate_request(
    request_id: str,
    poster: Identity = Depends(get_current_poster),
    db: Session = Depends(get_db),
):
    return controller.reactivate_request(request_id, db, poster)


@router.post("/hospital/close/{request_id}", response_model=dtos.BloodRequestOut)
def close_request_as_hospital(
    request_id: str,
    hospital: Hospital = Depends(get_current_hospital),
    db: Session = Depends(get_db),
):
    return controller.close_request(request_id, db, hospital=hospital)


@router.post("/poster/close/{request_id}", response_model=dtos.BloodRequestOut)
def close_request_as_poster(
    request_id: str,
    poster: Identity = Depends(get_current_poster),
    db: Session = Depends(get_db),
):
    return controller.close_request(request_id, db, identity=poster)


# --- Sweeps. Manual for now; point a scheduler at these in Phase 2. --------

@router.post("/admin/expire-overdue")
def expire_overdue(db: Session = Depends(get_db), _admin: Identity = Depends(get_current_admin)):
    return {"expired_count": controller.expire_overdue_requests(db)}


@router.post("/admin/auto-widen")
def auto_widen(db: Session = Depends(get_db), _admin: Identity = Depends(get_current_admin)):
    return {"widened_count": controller.auto_widen_stale_requests(db)}
