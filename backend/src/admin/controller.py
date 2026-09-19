from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.admin import dtos
from src.hospitals.models import Hospital
from src.organizations.models import Organization
from src.utils.auth import require_roles
from src.utils.enums import ApprovalStatus
from src.utils.helpers import constant_time_equals, create_access_token
from src.utils.settings import settings

get_current_admin = require_roles("admin")


def login(data: dtos.AdminLogin) -> str:
    if not settings.admin_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin access is not configured on this server",
        )

    # Both comparisons always run, and both are constant-time: `!=` on the
    # secret leaked its common prefix length, and short-circuiting on the email
    # would reveal whether the address was the right one.
    email_ok = constant_time_equals(data.email, settings.ADMIN_EMAIL)
    password_ok = constant_time_equals(data.password, settings.ADMIN_PASSWORD)
    if not (email_ok and password_ok):
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
