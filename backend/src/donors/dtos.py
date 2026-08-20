import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from src.utils.enums import BloodType


class DonorSignup(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str
    blood_type: BloodType


class DonorLogin(BaseModel):
    email: EmailStr
    password: str


class DonorUpdateLocation(BaseModel):
    latitude: float
    longitude: float
    area_label: str


class DonorUpdateProfile(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    blood_type: BloodType | None = None


class DonorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: EmailStr
    phone: str
    blood_type: BloodType
    profile_pic_url: str | None
    area_label: str | None
    is_email_verified: bool
    is_active: bool
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
