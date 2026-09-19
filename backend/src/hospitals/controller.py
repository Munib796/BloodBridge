from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from src.hospitals import dtos
from src.hospitals.models import Hospital
from src.utils import accounts
from src.utils.auth import get_current_entity
from src.utils.cloudinary_utils import upload_image
from src.utils.geo import make_point
from src.utils.helpers import create_access_token, hash_password, verify_password

ROLE = "hospital"

get_current_hospital = get_current_entity(ROLE)


def signup(data: dtos.HospitalSignup, db: Session) -> Hospital:
    if db.query(Hospital).filter(Hospital.email == data.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    if db.query(Hospital).filter(Hospital.name == data.name).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hospital name already registered")

    hospital = Hospital(
        name=data.name,
        email=data.email,
        phone=data.phone,
        password_hash=hash_password(data.password),
        address=data.address,
        location=make_point(data.latitude, data.longitude),
    )
    db.add(hospital)
    db.commit()
    db.refresh(hospital)
    # Approval is by the platform admin, not email-based, so no verification
    # email is sent here — the account simply sits at approval_status=pending.
    return hospital


def login(data: dtos.HospitalLogin, db: Session) -> str:
    hospital = db.query(Hospital).filter(Hospital.email == data.email).first()
    if not hospital or not verify_password(data.password, hospital.password_hash):
        raise accounts.invalid_credentials()
    # Admin approval is the gate for this role; there is no email flow to check.
    accounts.assert_can_login(hospital, require_verification=False)
    return create_access_token({"id": str(hospital.id), "role": ROLE})


def upload_logo(hospital: Hospital, file: UploadFile, db: Session) -> Hospital:
    hospital.logo_url = upload_image(file, folder="bloodbridge/hospitals")
    db.commit()
    db.refresh(hospital)
    return hospital
