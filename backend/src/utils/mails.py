from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from src.utils.settings import settings

conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
)

fast_mail = FastMail(conf)


async def send_verification_email(to_email: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    message = MessageSchema(
        subject="Verify your BloodBridge account",
        recipients=[to_email],
        body=f"<p>Welcome to BloodBridge. Click below to verify your email:</p>"
             f'<p><a href="{link}">{link}</a></p>',
        subtype=MessageType.html,
    )
    await fast_mail.send_message(message)


async def send_password_reset_email(to_email: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    message = MessageSchema(
        subject="Reset your BloodBridge password",
        recipients=[to_email],
        body=f"<p>Click below to reset your password. This link expires shortly.</p>"
             f'<p><a href="{link}">{link}</a></p>',
        subtype=MessageType.html,
    )
    await fast_mail.send_message(message)
