from fastapi import Depends, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from src.organizations.models import Organization
from src.organizations import dtos
from src.utils.cloudinary_utils import upload_file_to_cloudinary
from src.utils.database import get_db
from src.utils.enums import ApprovalStatus
from src.utils.geo import make_point
from src.utils.helpers import create_access_token, decode_access_token, hash_password, verify_password

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="organizations/login", auto_error=False)


def get_current_organization(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Organization:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(token, expected_role="organization")
    org = db.query(Organization).filter(Organization.id == payload.get("id")).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Organization not found")
    return org


def signup(data: dtos.OrganizationSignup, db: Session) -> Organization:
    if db.query(Organization).filter(Organization.email == data.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    org = Organization(
        name=data.name,
        email=data.email,
        phone=data.phone,
        password_hash=hash_password(data.password),
        address=data.address,
        location=make_point(data.latitude, data.longitude),
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def login(data: dtos.OrganizationLogin, db: Session) -> str:
    org = db.query(Organization).filter(Organization.email == data.email).first()
    if not org or not verify_password(data.password, org.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if org.approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {org.approval_status.value}, awaiting admin approval",
        )
    return create_access_token({"id": str(org.id), "role": "organization"})


async def upload_logo(org: Organization, file: UploadFile, db: Session) -> Organization:
    url = await upload_file_to_cloudinary(file, folder="bloodbridge/organizations")
    org.logo_url = url
    db.commit()
    db.refresh(org)
    return org
