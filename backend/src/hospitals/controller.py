from fastapi import Depends, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from src.hospitals.models import Hospital
from src.hospitals import dtos
from src.utils.cloudinary_utils import upload_file_to_cloudinary
from src.utils.database import get_db
from src.utils.enums import ApprovalStatus
from src.utils.geo import make_point
from src.utils.helpers import create_access_token, decode_access_token, hash_password, verify_password

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="hospitals/login", auto_error=False)


def get_current_hospital(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Hospital:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(token, expected_role="hospital")
    hospital = db.query(Hospital).filter(Hospital.id == payload.get("id")).first()
    if not hospital:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Hospital not found")
    return hospital


def signup(data: dtos.HospitalSignup, db: Session) -> Hospital:
    if db.query(Hospital).filter(Hospital.email == data.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if hospital.approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {hospital.approval_status.value}, awaiting admin approval",
        )
    return create_access_token({"id": str(hospital.id), "role": "hospital"})


async def upload_logo(hospital: Hospital, file: UploadFile, db: Session) -> Hospital:
    url = await upload_file_to_cloudinary(file, folder="bloodbridge/hospitals")
    hospital.logo_url = url
    db.commit()
    db.refresh(hospital)
    return hospital
