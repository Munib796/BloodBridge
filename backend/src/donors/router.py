from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.orm import Session

from src.donors import controller, dtos
from src.donors.controller import get_current_donor
from src.donors.models import Donor
from src.utils.database import get_db
from src.utils.limiter import limiter
from fastapi import Request

router = APIRouter(prefix="/donors", tags=["donors"])


@router.post("/signup", response_model=dtos.DonorOut, status_code=201)
@limiter.limit("5/minute")
async def signup(request: Request, data: dtos.DonorSignup, db: Session = Depends(get_db)):
    return await controller.signup(data, db)


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    controller.verify_email(token, db)
    return {"message": "Email verified successfully"}


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


@router.post("/me/profile-pic", response_model=dtos.DonorOut)
async def upload_profile_pic(
    file: UploadFile,
    donor: Donor = Depends(get_current_donor),
    db: Session = Depends(get_db),
):
    return await controller.upload_profile_pic(donor, file, db)


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, data: dtos.ForgotPasswordRequest, db: Session = Depends(get_db)):
    await controller.forgot_password(data, db)
    return {"message": "If that email exists, a reset link has been sent"}


@router.post("/reset-password")
def reset_password(data: dtos.ResetPasswordRequest, db: Session = Depends(get_db)):
    controller.reset_password(data, db)
    return {"message": "Password reset successfully"}
