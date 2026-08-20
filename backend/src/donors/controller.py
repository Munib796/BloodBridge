from fastapi import Depends, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from src.donors.models import Donor
from src.donors import dtos
from src.utils.cloudinary_utils import upload_file_to_cloudinary
from src.utils.database import get_db
from src.utils.geo import make_point
from src.utils.helpers import (
    create_access_token,
    create_purpose_token,
    decode_access_token,
    decode_token_for_purpose,
    hash_password,
    verify_password,
)
from src.utils.mails import send_password_reset_email, send_verification_email

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="donors/login", auto_error=False)


def get_current_donor(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Donor:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(token, expected_role="donor")
    donor = db.query(Donor).filter(Donor.id == payload.get("id")).first()
    if not donor:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Donor not found")
    return donor


async def signup(data: dtos.DonorSignup, db: Session) -> Donor:
    if db.query(Donor).filter(Donor.email == data.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    donor = Donor(
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        password_hash=hash_password(data.password),
        blood_type=data.blood_type,
    )
    db.add(donor)
    db.commit()
    db.refresh(donor)

    token = create_purpose_token({"id": str(donor.id), "role": "donor"}, purpose="verify_email")
    try:
        await send_verification_email(donor.email, token)
    except Exception:
        # Account is already created; a transient mail-server issue
        # shouldn't fail signup. Verification can be re-triggered later.
        pass
    return donor


def verify_email(token: str, db: Session) -> None:
    payload = decode_token_for_purpose(token, expected_purpose="verify_email")
    donor = db.query(Donor).filter(Donor.id == payload.get("id")).first()
    if not donor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Donor not found")
    donor.is_email_verified = True
    db.commit()


def login(data: dtos.DonorLogin, db: Session) -> str:
    donor = db.query(Donor).filter(Donor.email == data.email).first()
    if not donor or not verify_password(data.password, donor.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not donor.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    return create_access_token({"id": str(donor.id), "role": "donor"})


def update_location(donor: Donor, data: dtos.DonorUpdateLocation, db: Session) -> Donor:
    donor.location = make_point(data.latitude, data.longitude)
    donor.area_label = data.area_label
    db.commit()
    db.refresh(donor)
    return donor


def update_profile(donor: Donor, data: dtos.DonorUpdateProfile, db: Session) -> Donor:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(donor, field, value)
    db.commit()
    db.refresh(donor)
    return donor


async def upload_profile_pic(donor: Donor, file: UploadFile, db: Session) -> Donor:
    url = await upload_file_to_cloudinary(file, folder="bloodbridge/donors")
    donor.profile_pic_url = url
    db.commit()
    db.refresh(donor)
    return donor


async def forgot_password(data: dtos.ForgotPasswordRequest, db: Session) -> None:
    donor = db.query(Donor).filter(Donor.email == data.email).first()
    if not donor:
        return  # don't leak whether the email exists
    token = create_purpose_token({"id": str(donor.id), "role": "donor"}, purpose="reset_password")
    try:
        await send_password_reset_email(donor.email, token)
    except Exception:
        pass


def reset_password(data: dtos.ResetPasswordRequest, db: Session) -> None:
    payload = decode_token_for_purpose(data.token, expected_purpose="reset_password")
    donor = db.query(Donor).filter(Donor.id == payload.get("id")).first()
    if not donor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Donor not found")
    donor.password_hash = hash_password(data.new_password)
    db.commit()
