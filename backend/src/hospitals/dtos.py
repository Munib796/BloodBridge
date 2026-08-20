import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from src.utils.enums import ApprovalStatus


class HospitalSignup(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    address: str
    latitude: float
    longitude: float


class HospitalLogin(BaseModel):
    email: EmailStr
    password: str


class HospitalOut(BaseModel):
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
