import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from src.utils.enums import BloodType
from src.utils.validators import DeviceToken, Label, Latitude, Longitude, Name, Password, Phone


class DonorSignup(BaseModel):
    full_name: Name
    email: EmailStr
    phone: Phone
    password: Password
    blood_type: BloodType


class DonorLogin(BaseModel):
    email: EmailStr
    password: str


class DonorUpdateLocation(BaseModel):
    latitude: Latitude
    longitude: Longitude
    area_label: Label


class DonorUpdateProfile(BaseModel):
    full_name: Name | None = None
    phone: Phone | None = None
    blood_type: BloodType | None = None


class DonorUpdateDeviceToken(BaseModel):
    # Required but nullable: an explicit null unregisters the device (logout,
    # or the OS rotating the token), which is a real operation rather than the
    # "field omitted" case DonorUpdateProfile has to ignore.
    device_token: DeviceToken | None


class DonorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: EmailStr
    phone: str
    blood_type: BloodType
    profile_pic_url: str | None
    area_label: str | None
    # Only ever returned on the donor's own /donors/me* endpoints, so this
    # doesn't hand one donor's push token to anybody else.
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
