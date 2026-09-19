import logging

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from src.utils.settings import settings

logger = logging.getLogger(__name__)

# Built lazily: constructing ConnectionConfig at import time made the whole
# app un-startable without SMTP credentials.
_mailer: FastMail | None = None


def _get_mailer() -> FastMail | None:
    global _mailer
    if not settings.mail_configured:
        return None
    if _mailer is None:
        _mailer = FastMail(
            ConnectionConfig(
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
        )
    return _mailer


async def _send(subject: str, to_email: str, body: str) -> None:
    mailer = _get_mailer()
    if mailer is None:
        logger.warning("Mail is not configured; skipped sending %r to %s", subject, to_email)
        return
    await mailer.send_message(
        MessageSchema(subject=subject, recipients=[to_email], body=body, subtype=MessageType.html)
    )


async def send_verification_email(to_email: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    await _send(
        "Verify your BloodBridge account",
        to_email,
        "<p>Welcome to BloodBridge. Click below to verify your email:</p>"
        f'<p><a href="{link}">{link}</a></p>',
    )


async def send_password_reset_email(to_email: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    await _send(
        "Reset your BloodBridge password",
        to_email,
        "<p>Click below to reset your password. This link expires shortly and "
        "can only be used once.</p>"
        f'<p><a href="{link}">{link}</a></p>',
    )


# --- Fire-and-forget variants --------------------------------------------
# Queued via BackgroundTasks after the response is sent, so a slow or broken
# SMTP server never delays (or fails) signup. They must not raise: an
# exception in a background task is logged by Starlette but has no caller.

async def safe_send_verification_email(to_email: str, token: str) -> None:
    try:
        await send_verification_email(to_email, token)
    except Exception:
        logger.exception("Failed to send verification email to %s", to_email)


async def safe_send_password_reset_email(to_email: str, token: str) -> None:
    try:
        await send_password_reset_email(to_email, token)
    except Exception:
        logger.exception("Failed to send password reset email to %s", to_email)
