from fastapi import APIRouter, Depends, Request, UploadFile
from sqlalchemy.orm import Session

from src.requestors import controller, dtos
from src.requestors.controller import get_current_requestor
from src.requestors.models import Requestor
from src.utils.database import get_db
from src.utils.limiter import limiter

router = APIRouter(prefix="/requestors", tags=["requestors"])


@router.post("/signup", response_model=dtos.RequestorOut, status_code=201)
@limiter.limit("5/minute")
async def signup(request: Request, data: dtos.RequestorSignup, db: Session = Depends(get_db)):
    return await controller.signup(data, db)


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    controller.verify_email(token, db)
    return {"message": "Email verified successfully"}


@router.post("/login", response_model=dtos.TokenOut)
@limiter.limit("10/minute")
def login(request: Request, data: dtos.RequestorLogin, db: Session = Depends(get_db)):
    token = controller.login(data, db)
    return dtos.TokenOut(access_token=token)


@router.get("/me", response_model=dtos.RequestorOut)
def get_me(requestor: Requestor = Depends(get_current_requestor)):
    return requestor


@router.patch("/me", response_model=dtos.RequestorOut)
def update_profile(
    data: dtos.RequestorUpdateProfile,
    requestor: Requestor = Depends(get_current_requestor),
    db: Session = Depends(get_db),
):
    return controller.update_profile(requestor, data, db)


@router.post("/me/profile-pic", response_model=dtos.RequestorOut)
async def upload_profile_pic(
    file: UploadFile,
    requestor: Requestor = Depends(get_current_requestor),
    db: Session = Depends(get_db),
):
    return await controller.upload_profile_pic(requestor, file, db)


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, data: dtos.ForgotPasswordRequest, db: Session = Depends(get_db)):
    await controller.forgot_password(data, db)
    return {"message": "If that email exists, a reset link has been sent"}


@router.post("/reset-password")
def reset_password(data: dtos.ResetPasswordRequest, db: Session = Depends(get_db)):
    controller.reset_password(data, db)
    return {"message": "Password reset successfully"}
