import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from src.utils.validators import DeviceToken, Name, Password, Phone


class RequestorSignup(BaseModel):
    full_name: Name
    email: EmailStr
    phone: Phone
    password: Password


class RequestorLogin(BaseModel):
    email: EmailStr
    password: str


class RequestorUpdateProfile(BaseModel):
    full_name: Name | None = None
    phone: Phone | None = None


class RequestorUpdateDeviceToken(BaseModel):
    # Required but nullable: an explicit null unregisters the device (logout,
    # or the OS rotating the token), which is a real operation rather than the
    # "field omitted" case RequestorUpdateProfile has to ignore.
    device_token: DeviceToken | None


class RequestorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: EmailStr
    phone: str
    profile_pic_url: str | None
    device_token: str | None
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
    new_password: Password
