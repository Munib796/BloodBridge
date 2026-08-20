from fastapi import Depends, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from src.requestors.models import Requestor
from src.requestors import dtos
from src.utils.cloudinary_utils import upload_file_to_cloudinary
from src.utils.database import get_db
from src.utils.helpers import (
    create_access_token,
    create_purpose_token,
    decode_access_token,
    decode_token_for_purpose,
    hash_password,
    verify_password,
)
from src.utils.mails import send_password_reset_email, send_verification_email

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="requestors/login", auto_error=False)


def get_current_requestor(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Requestor:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(token, expected_role="requestor")
    requestor = db.query(Requestor).filter(Requestor.id == payload.get("id")).first()
    if not requestor:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Requestor not found")
    return requestor


async def signup(data: dtos.RequestorSignup, db: Session) -> Requestor:
    if db.query(Requestor).filter(Requestor.email == data.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    requestor = Requestor(
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        password_hash=hash_password(data.password),
    )
    db.add(requestor)
    db.commit()
    db.refresh(requestor)

    token = create_purpose_token({"id": str(requestor.id), "role": "requestor"}, purpose="verify_email")
    try:
        await send_verification_email(requestor.email, token)
    except Exception:
        pass
    return requestor


def verify_email(token: str, db: Session) -> None:
    payload = decode_token_for_purpose(token, expected_purpose="verify_email")
    requestor = db.query(Requestor).filter(Requestor.id == payload.get("id")).first()
    if not requestor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requestor not found")
    requestor.is_email_verified = True
    db.commit()


def login(data: dtos.RequestorLogin, db: Session) -> str:
    requestor = db.query(Requestor).filter(Requestor.email == data.email).first()
    if not requestor or not verify_password(data.password, requestor.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not requestor.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    return create_access_token({"id": str(requestor.id), "role": "requestor"})


def update_profile(requestor: Requestor, data: dtos.RequestorUpdateProfile, db: Session) -> Requestor:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(requestor, field, value)
    db.commit()
    db.refresh(requestor)
    return requestor


async def upload_profile_pic(requestor: Requestor, file: UploadFile, db: Session) -> Requestor:
    url = await upload_file_to_cloudinary(file, folder="bloodbridge/requestors")
    requestor.profile_pic_url = url
    db.commit()
    db.refresh(requestor)
    return requestor


async def forgot_password(data: dtos.ForgotPasswordRequest, db: Session) -> None:
    requestor = db.query(Requestor).filter(Requestor.email == data.email).first()
    if not requestor:
        return
    token = create_purpose_token({"id": str(requestor.id), "role": "requestor"}, purpose="reset_password")
    try:
        await send_password_reset_email(requestor.email, token)
    except Exception:
        pass


def reset_password(data: dtos.ResetPasswordRequest, db: Session) -> None:
    payload = decode_token_for_purpose(data.token, expected_purpose="reset_password")
    requestor = db.query(Requestor).filter(Requestor.id == payload.get("id")).first()
    if not requestor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requestor not found")
    requestor.password_hash = hash_password(data.new_password)
    db.commit()
