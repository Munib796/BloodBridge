from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from src.organizations import dtos
from src.organizations.models import Organization
from src.utils import accounts
from src.utils.auth import get_current_entity
from src.utils.cloudinary_utils import upload_image
from src.utils.geo import make_point
from src.utils.helpers import create_access_token, hash_password, verify_password

ROLE = "organization"

get_current_organization = get_current_entity(ROLE)


def signup(data: dtos.OrganizationSignup, db: Session) -> Organization:
    if db.query(Organization).filter(Organization.email == data.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    if db.query(Organization).filter(Organization.name == data.name).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Organization name already registered"
        )

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
        raise accounts.invalid_credentials()
    # Admin approval is the gate for this role; there is no email flow to check.
    accounts.assert_can_login(org, require_verification=False)
    return create_access_token({"id": str(org.id), "role": ROLE})


def upload_logo(org: Organization, file: UploadFile, db: Session) -> Organization:
    org.logo_url = upload_image(file, folder="bloodbridge/organizations")
    db.commit()
    db.refresh(org)
    return org
