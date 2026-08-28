from fastapi import APIRouter, Depends, Request, UploadFile
from sqlalchemy.orm import Session

from src.hospitals import controller, dtos
from src.hospitals.controller import get_current_hospital
from src.hospitals.models import Hospital
from src.utils.database import get_db
from src.utils.limiter import limiter

router = APIRouter(prefix="/hospitals", tags=["hospitals"])


@router.post("/signup", response_model=dtos.HospitalOut, status_code=201)
@limiter.limit("5/minute")
def signup(request: Request, data: dtos.HospitalSignup, db: Session = Depends(get_db)):
    return controller.signup(data, db)


@router.post("/login", response_model=dtos.TokenOut)
@limiter.limit("10/minute")
def login(request: Request, data: dtos.HospitalLogin, db: Session = Depends(get_db)):
    token = controller.login(data, db)
    return dtos.TokenOut(access_token=token)


@router.get("/me", response_model=dtos.HospitalOut)
def get_me(hospital: Hospital = Depends(get_current_hospital)):
    return hospital


@router.post("/me/logo", response_model=dtos.HospitalOut)
@limiter.limit("10/minute")
def upload_logo(
    request: Request,
    file: UploadFile,
    hospital: Hospital = Depends(get_current_hospital),
    db: Session = Depends(get_db),
):
    return controller.upload_logo(hospital, file, db)
