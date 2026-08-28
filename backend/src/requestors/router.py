from fastapi import APIRouter, BackgroundTasks, Depends, Request, UploadFile
from sqlalchemy.orm import Session

from src.requestors import controller, dtos
from src.requestors.controller import get_current_requestor
from src.requestors.models import Requestor
from src.utils.database import get_db
from src.utils.limiter import limiter

router = APIRouter(prefix="/requestors", tags=["requestors"])


@router.post("/signup", response_model=dtos.RequestorOut, status_code=201)
@limiter.limit("5/minute")
def signup(
    request: Request,
    data: dtos.RequestorSignup,
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
@limiter.limit("10/minute")
def upload_profile_pic(
    request: Request,
    file: UploadFile,
    requestor: Requestor = Depends(get_current_requestor),
    db: Session = Depends(get_db),
):
    return controller.upload_profile_pic(requestor, file, db)


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
