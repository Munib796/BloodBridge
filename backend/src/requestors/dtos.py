import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class RequestorSignup(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str


class RequestorLogin(BaseModel):
    email: EmailStr
    password: str


class RequestorUpdateProfile(BaseModel):
    full_name: str | None = None
    phone: str | None = None


class RequestorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: EmailStr
    phone: str
    profile_pic_url: str | None
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
