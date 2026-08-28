from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str

    # Connection pool. The defaults are deliberately larger than SQLAlchemy's
    # (5 + 10) because chat holds connections for short bursts under load.
    DB_POOL_SIZE: int
    DB_MAX_OVERFLOW: int
    DB_ECHO: bool

    # JWT — only the secret is mandatory; the rest have sane defaults so a
    # fresh checkout starts with a minimal .env.
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    EMAIL_TOKEN_EXPIRE_MINUTES: int


    # --- Web -----------------------------------------------------------------
    FRONTEND_URL: str

    # When true (the default), donors and requestors must click the emailed
    # verification link before they can log in. Set false for local work with
    # no SMTP server configured, otherwise nobody can ever verify.
    REQUIRE_EMAIL_VERIFICATION: bool

    # Comma-separated list of allowed browser origins. Falls back to
    # FRONTEND_URL. Never "*" — the app authenticates with bearer tokens and
    # a wildcard is both unsafe and rejected by browsers alongside credentials.
    CORS_ORIGINS: str = ""

    # Set true only when running behind a proxy/load balancer you control,
    # so the rate limiter keys on X-Forwarded-For instead of the proxy IP.
    TRUST_PROXY: bool

    # Mail (optional — signup still works, verification mail is just skipped)
    MAIL_USERNAME: str
    MAIL_PASSWORD: str
    MAIL_FROM: str
    MAIL_PORT: int
    MAIL_SERVER: str
    MAIL_FROM_NAME: str

    # Cloudinary (optional — uploads return 503 until configured)
    CLOUDINARY_CLOUD_NAME: str
    CLOUDINARY_API_KEY: str
    CLOUDINARY_API_SECRET: str

    # Hardcoded admin (no admin DB table). Login is disabled while unset,
    # rather than accepting a blank email/password pair.
    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.CORS_ORIGINS or self.FRONTEND_URL
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def mail_configured(self) -> bool:
        return bool(self.MAIL_SERVER and self.MAIL_USERNAME and self.MAIL_FROM)

    @property
    def cloudinary_configured(self) -> bool:
        return bool(
            self.CLOUDINARY_CLOUD_NAME and self.CLOUDINARY_API_KEY and self.CLOUDINARY_API_SECRET
        )

    @property
    def admin_configured(self) -> bool:
        return bool(self.ADMIN_EMAIL and self.ADMIN_PASSWORD)


settings = Settings()
