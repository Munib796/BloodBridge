import logging

import cloudinary
import cloudinary.uploader
from fastapi import HTTPException, UploadFile, status

from src.utils.constants import ALLOWED_IMAGE_CONTENT_TYPES, MAX_UPLOAD_BYTES
from src.utils.settings import settings

logger = logging.getLogger(__name__)

_configured = False


def _configure() -> None:
    global _configured
    if _configured:
        return
    if not settings.cloudinary_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image uploads are not configured on this server",
        )
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )
    _configured = True


def _measure(file: UploadFile) -> int:
    """Size of the upload without reading it into memory. Starlette spools
    the body to a temp file, so we can seek instead of buffering."""
    if file.size is not None:
        return file.size
    file.file.seek(0, 2)  # SEEK_END
    size = file.file.tell()
    file.file.seek(0)
    return size


def upload_image(file: UploadFile, folder: str) -> str:
    """Upload an image (profile pic, hospital/org logo) and return its secure
    URL. `folder` groups uploads, e.g. 'bloodbridge/donors'.

    Deliberately synchronous: the Cloudinary SDK makes a blocking HTTP call,
    so this must be invoked from a sync endpoint (FastAPI runs those in a
    threadpool) rather than awaited on the event loop.
    """
    if file.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type {file.content_type!r}. Allowed: JPEG, PNG, WebP",
        )

    size = _measure(file)
    if size == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
    if size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit",
        )

    _configure()
    file.file.seek(0)
    try:
        # Hand Cloudinary the file object so it streams rather than us holding
        # the whole payload in memory.
        result = cloudinary.uploader.upload(file.file, folder=folder, resource_type="image")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Cloudinary upload failed for folder %s", folder)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Image upload failed, please try again"
        )

    url = result.get("secure_url")
    if not url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Image upload failed, please try again"
        )
    return url
