from fastapi import BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from src.requestors import dtos
from src.requestors.models import Requestor
from src.utils import accounts
from src.utils.auth import get_current_entity
from src.utils.cloudinary_utils import upload_image
from src.utils.helpers import create_access_token, hash_password, verify_password

ROLE = "requestor"

get_current_requestor = get_current_entity(ROLE)


def signup(data: dtos.RequestorSignup, db: Session, background_tasks: BackgroundTasks) -> Requestor:
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

    accounts.queue_verification_email(requestor, ROLE, background_tasks)
    return requestor


def verify_email(token: str, db: Session) -> None:
    payload = accounts.decode_verification_token(token, ROLE)
    requestor = db.query(Requestor).filter(Requestor.id == payload.get("id")).first()
    if not requestor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requestor not found")
    requestor.is_email_verified = True
    db.commit()


def resend_verification(
    data: dtos.ForgotPasswordRequest, db: Session, background_tasks: BackgroundTasks
) -> None:
    requestor = db.query(Requestor).filter(Requestor.email == data.email).first()
    # Silent no-op for unknown or already-verified addresses, so this can't be
    # used to enumerate registered emails.
    if requestor and not requestor.is_email_verified:
        accounts.queue_verification_email(requestor, ROLE, background_tasks)


def login(data: dtos.RequestorLogin, db: Session) -> str:
    requestor = db.query(Requestor).filter(Requestor.email == data.email).first()
    if not requestor or not verify_password(data.password, requestor.password_hash):
        raise accounts.invalid_credentials()
    accounts.assert_can_login(requestor, require_verification=True)
    return create_access_token({"id": str(requestor.id), "role": ROLE})


def update_profile(requestor: Requestor, data: dtos.RequestorUpdateProfile, db: Session) -> Requestor:
    for field, value in data.model_dump(exclude_unset=True).items():
        # An explicit `null` would otherwise write NULL into a NOT NULL column
        # and surface as a 500. Clearing these fields isn't supported.
        if value is None:
            continue
        setattr(requestor, field, value)
    db.commit()
    db.refresh(requestor)
    return requestor


def upload_profile_pic(requestor: Requestor, file: UploadFile, db: Session) -> Requestor:
    requestor.profile_pic_url = upload_image(file, folder="bloodbridge/requestors")
    db.commit()
    db.refresh(requestor)
    return requestor


def forgot_password(
    data: dtos.ForgotPasswordRequest, db: Session, background_tasks: BackgroundTasks
) -> None:
    requestor = db.query(Requestor).filter(Requestor.email == data.email).first()
    if not requestor:
        return  # don't leak whether the email exists
    accounts.queue_password_reset_email(requestor, ROLE, background_tasks)


def reset_password(data: dtos.ResetPasswordRequest, db: Session) -> None:
    payload = accounts.decode_reset_token(data.token, ROLE)
    requestor = db.query(Requestor).filter(Requestor.id == payload.get("id")).first()
    if not requestor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requestor not found")
    accounts.apply_password_reset(requestor, data.new_password, payload, db)
