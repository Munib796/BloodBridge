"""Reusable Pydantic field types, so validation rules live in one place
instead of being restated (or forgotten) in every module's DTOs."""

from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, Field

from src.utils.constants import (
    MAX_ADDRESS_LENGTH,
    MAX_NAME_LENGTH,
    MAX_PASSWORD_LENGTH,
    MAX_PHONE_LENGTH,
    MAX_UNITS,
    MIN_PASSWORD_LENGTH,
    MIN_PHONE_LENGTH,
    MIN_UNITS,
)


def _check_password_strength(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if len(value) > MAX_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_LENGTH} characters long")
    if not any(char.isalpha() for char in value):
        raise ValueError("Password must contain at least one letter")
    if not any(char.isdigit() for char in value):
        raise ValueError("Password must contain at least one digit")
    return value


def _must_be_future(value: datetime) -> datetime:
    # Clients may send a naive timestamp; treat it as UTC rather than
    # rejecting it, so the comparison below never raises on tz mismatch.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    if value <= datetime.now(timezone.utc):
        raise ValueError("Must be a timestamp in the future")
    return value


def _strip(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("Must not be blank")
    return stripped


Password = Annotated[str, AfterValidator(_check_password_strength)]
FutureDatetime = Annotated[datetime, AfterValidator(_must_be_future)]

Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]

Units = Annotated[int, Field(ge=MIN_UNITS, le=MAX_UNITS)]

Name = Annotated[str, Field(min_length=1, max_length=MAX_NAME_LENGTH), AfterValidator(_strip)]
Phone = Annotated[str, Field(min_length=MIN_PHONE_LENGTH, max_length=MAX_PHONE_LENGTH), AfterValidator(_strip)]
Address = Annotated[str, Field(min_length=1, max_length=MAX_ADDRESS_LENGTH), AfterValidator(_strip)]
Label = Annotated[str, Field(min_length=1, max_length=MAX_NAME_LENGTH), AfterValidator(_strip)]
