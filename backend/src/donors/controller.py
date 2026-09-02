from fastapi import BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from src.donors import dtos
from src.donors.models import Donor
from src.utils import accounts
from src.utils.auth import get_current_entity
from src.utils.cloudinary_utils import upload_image
from src.utils.geo import make_point
from src.utils.helpers import create_access_token, hash_password, verify_password

ROLE = "donor"

get_current_donor = get_current_entity(ROLE)


def signup(data: dtos.DonorSignup, db: Session, background_tasks: BackgroundTasks) -> Donor:
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

    accounts.queue_verification_email(donor, ROLE, background_tasks)
    return donor


def verify_email(token: str, db: Session) -> None:
    payload = accounts.decode_verification_token(token, ROLE)
    donor = db.query(Donor).filter(Donor.id == payload.get("id")).first()
    if not donor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Donor not found")
    donor.is_email_verified = True
    db.commit()


def resend_verification(data: dtos.ForgotPasswordRequest, db: Session, background_tasks: BackgroundTasks) -> None:
    donor = db.query(Donor).filter(Donor.email == data.email).first()
    # Silent no-op for unknown or already-verified addresses, so this can't be
    # used to enumerate registered emails.
    if donor and not donor.is_email_verified:
        accounts.queue_verification_email(donor, ROLE, background_tasks)


def login(data: dtos.DonorLogin, db: Session) -> str:
    donor = db.query(Donor).filter(Donor.email == data.email).first()
    if not donor or not verify_password(data.password, donor.password_hash):
        raise accounts.invalid_credentials()
    accounts.assert_can_login(donor, require_verification=True)
    return create_access_token({"id": str(donor.id), "role": ROLE})


def update_location(donor: Donor, data: dtos.DonorUpdateLocation, db: Session) -> Donor:
    donor.location = make_point(data.latitude, data.longitude)
    donor.area_label = data.area_label
    db.commit()
    db.refresh(donor)
    return donor


def update_profile(donor: Donor, data: dtos.DonorUpdateProfile, db: Session) -> Donor:
    for field, value in data.model_dump(exclude_unset=True).items():
        # An explicit `null` would otherwise write NULL into a NOT NULL column
        # and surface as a 500. Clearing these fields isn't supported.
        if value is None:
            continue
        setattr(donor, field, value)
    db.commit()
    db.refresh(donor)
    return donor


def update_device_token(donor: Donor, data: dtos.DonorUpdateDeviceToken, db: Session) -> Donor:
    """Register (or, with an explicit null, unregister) this donor's push token.

    Unlike update_profile() a None is honoured rather than skipped: the column
    is nullable, and clearing it is how the app says "stop notifying this
    device" on logout.
    """
    donor.device_token = data.device_token
    db.commit()
    db.refresh(donor)
    return donor


def upload_profile_pic(donor: Donor, file: UploadFile, db: Session) -> Donor:
    donor.profile_pic_url = upload_image(file, folder="bloodbridge/donors")
    db.commit()
    db.refresh(donor)
    return donor


def forgot_password(data: dtos.ForgotPasswordRequest, db: Session, background_tasks: BackgroundTasks) -> None:
    donor = db.query(Donor).filter(Donor.email == data.email).first()
    if not donor:
        return  # don't leak whether the email exists
    accounts.queue_password_reset_email(donor, ROLE, background_tasks)


def reset_password(data: dtos.ResetPasswordRequest, db: Session) -> None:
    payload = accounts.decode_reset_token(data.token, ROLE)
    donor = db.query(Donor).filter(Donor.id == payload.get("id")).first()
    if not donor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Donor not found")
    accounts.apply_password_reset(donor, data.new_password, payload, db)
