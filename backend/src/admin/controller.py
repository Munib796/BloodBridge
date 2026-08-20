from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from src.admin import dtos
from src.hospitals.models import Hospital
from src.organizations.models import Organization
from src.utils.enums import ApprovalStatus
from src.utils.helpers import create_access_token, decode_access_token
from src.utils.settings import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="admin/login", auto_error=False)


def get_current_admin(token: str = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return decode_access_token(token, expected_role="admin")


def login(data: dtos.AdminLogin) -> str:
    if data.email != settings.ADMIN_EMAIL or data.password != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return create_access_token({"id": "admin", "role": "admin"})


def list_pending_hospitals(db: Session) -> list[Hospital]:
    return db.query(Hospital).filter(Hospital.approval_status == ApprovalStatus.PENDING).all()


def decide_hospital(hospital_id: str, decision: dtos.ApprovalDecision, db: Session) -> Hospital:
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
    hospital.approval_status = ApprovalStatus.APPROVED if decision.approve else ApprovalStatus.REJECTED
    db.commit()
    db.refresh(hospital)
    return hospital


def list_pending_organizations(db: Session) -> list[Organization]:
    return db.query(Organization).filter(Organization.approval_status == ApprovalStatus.PENDING).all()


def decide_organization(org_id: str, decision: dtos.ApprovalDecision, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    org.approval_status = ApprovalStatus.APPROVED if decision.approve else ApprovalStatus.REJECTED
    db.commit()
    db.refresh(org)
    return org
