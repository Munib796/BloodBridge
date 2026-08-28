import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from src.utils.enums import ApprovalStatus
from src.utils.validators import Address, Latitude, Longitude, Name, Password, Phone


class OrganizationSignup(BaseModel):
    name: Name
    email: EmailStr
    phone: Phone
    password: Password
    address: Address
    latitude: Latitude
    longitude: Longitude


class OrganizationLogin(BaseModel):
    email: EmailStr
    password: str


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: EmailStr
    phone: str
    address: str
    logo_url: str | None
    approval_status: ApprovalStatus
    is_email_verified: bool
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
