from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.admin import controller, dtos
from src.admin.controller import get_current_admin
from src.hospitals.dtos import HospitalOut
from src.organizations.dtos import OrganizationOut
from src.utils.database import get_db
from src.utils.limiter import limiter

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=dtos.TokenOut)
@limiter.limit("10/minute")
def login(request: Request, data: dtos.AdminLogin):
    token = controller.login(data)
    return dtos.TokenOut(access_token=token)


@router.get("/hospitals/pending", response_model=list[HospitalOut])
def list_pending_hospitals(db: Session = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    return controller.list_pending_hospitals(db)


@router.patch("/hospitals/{hospital_id}/decision", response_model=HospitalOut)
def decide_hospital(
    hospital_id: str,
    decision: dtos.ApprovalDecision,
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    return controller.decide_hospital(hospital_id, decision, db)


@router.get("/organizations/pending", response_model=list[OrganizationOut])
def list_pending_organizations(db: Session = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    return controller.list_pending_organizations(db)


@router.patch("/organizations/{org_id}/decision", response_model=OrganizationOut)
def decide_organization(
    org_id: str,
    decision: dtos.ApprovalDecision,
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    return controller.decide_organization(org_id, decision, db)
