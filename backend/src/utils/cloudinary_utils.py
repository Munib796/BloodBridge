import cloudinary
import cloudinary.uploader
from fastapi import UploadFile

from src.utils.settings import settings

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)


async def upload_file_to_cloudinary(file: UploadFile, folder: str) -> str:
    """Uploads an image (profile pic, hospital/org logo, etc.) and returns
    its secure URL. `folder` groups uploads, e.g. 'bloodbridge/donors'."""
    contents = await file.read()
    result = cloudinary.uploader.upload(contents, folder=folder, resource_type="image")
    return result["secure_url"]
