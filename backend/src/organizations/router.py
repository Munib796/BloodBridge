from fastapi import APIRouter, Depends, Request, UploadFile
from sqlalchemy.orm import Session

from src.organizations import controller, dtos
from src.organizations.controller import get_current_organization
from src.organizations.models import Organization
from src.utils.database import get_db
from src.utils.limiter import limiter

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("/signup", response_model=dtos.OrganizationOut, status_code=201)
@limiter.limit("5/minute")
def signup(request: Request, data: dtos.OrganizationSignup, db: Session = Depends(get_db)):
    return controller.signup(data, db)


@router.post("/login", response_model=dtos.TokenOut)
@limiter.limit("10/minute")
def login(request: Request, data: dtos.OrganizationLogin, db: Session = Depends(get_db)):
    token = controller.login(data, db)
    return dtos.TokenOut(access_token=token)


@router.get("/me", response_model=dtos.OrganizationOut)
def get_me(org: Organization = Depends(get_current_organization)):
    return org


@router.post("/me/logo", response_model=dtos.OrganizationOut)
@limiter.limit("10/minute")
def upload_logo(
    request: Request,
    file: UploadFile,
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    return controller.upload_logo(org, file, db)
