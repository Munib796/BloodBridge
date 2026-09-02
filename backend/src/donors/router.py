from fastapi import APIRouter, BackgroundTasks, Depends, Request, UploadFile
from sqlalchemy.orm import Session

from src.donors import controller, dtos
from src.donors.controller import get_current_donor
from src.donors.models import Donor
from src.utils.database import get_db
from src.utils.limiter import limiter

router = APIRouter(prefix="/donors", tags=["donors"])


# Endpoints are deliberately sync `def`: SQLAlchemy calls here are blocking, and
# FastAPI runs sync endpoints in a threadpool. Declaring them `async` ran that
# blocking work directly on the event loop. Email is queued via BackgroundTasks.

@router.post("/signup", response_model=dtos.DonorOut, status_code=201)
@limiter.limit("5/minute")
def signup(
    request: Request,
    data: dtos.DonorSignup,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    return controller.signup(data, db, background_tasks)


@router.get("/verify-email")
@limiter.limit("10/minute")
def verify_email(request: Request, token: str, db: Session = Depends(get_db)):
    controller.verify_email(token, db)
    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
@limiter.limit("3/minute")
def resend_verification(
    request: Request,
    data: dtos.ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    controller.resend_verification(data, db, background_tasks)
    return {"message": "If that email needs verifying, a new link has been sent"}


@router.post("/login", response_model=dtos.TokenOut)
@limiter.limit("10/minute")
def login(request: Request, data: dtos.DonorLogin, db: Session = Depends(get_db)):
    token = controller.login(data, db)
    return dtos.TokenOut(access_token=token)


@router.get("/me", response_model=dtos.DonorOut)
def get_me(donor: Donor = Depends(get_current_donor)):
    return donor


@router.patch("/me/location", response_model=dtos.DonorOut)
def update_location(
    data: dtos.DonorUpdateLocation,
    donor: Donor = Depends(get_current_donor),
    db: Session = Depends(get_db),
):
    return controller.update_location(donor, data, db)


@router.patch("/me", response_model=dtos.DonorOut)
def update_profile(
    data: dtos.DonorUpdateProfile,
    donor: Donor = Depends(get_current_donor),
    db: Session = Depends(get_db),
):
    return controller.update_profile(donor, data, db)


@router.patch("/me/device-token", response_model=dtos.DonorOut)
def update_device_token(
    data: dtos.DonorUpdateDeviceToken,
    donor: Donor = Depends(get_current_donor),
    db: Session = Depends(get_db),
):
    """Register the device that should receive push notifications about nearby
    requests. Send `{"device_token": null}` to unregister."""
    return controller.update_device_token(donor, data, db)


@router.post("/me/profile-pic", response_model=dtos.DonorOut)
@limiter.limit("10/minute")
def upload_profile_pic(
    request: Request,
    file: UploadFile,
    donor: Donor = Depends(get_current_donor),
    db: Session = Depends(get_db),
):
    return controller.upload_profile_pic(donor, file, db)


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    data: dtos.ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    controller.forgot_password(data, db, background_tasks)
    return {"message": "If that email exists, a reset link has been sent"}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, data: dtos.ResetPasswordRequest, db: Session = Depends(get_db)):
    controller.reset_password(data, db)
    return {"message": "Password reset successfully"}
