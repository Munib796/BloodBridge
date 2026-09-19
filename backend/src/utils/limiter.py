from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.utils.settings import settings


def client_key(request: Request) -> str:
    """Rate-limit key. Behind a proxy every request appears to come from the
    proxy's IP, which would make one shared bucket for all users — so honour
    the leftmost X-Forwarded-For hop, but only when TRUST_PROXY says the
    header can't be spoofed by the client.
    """
    if settings.TRUST_PROXY:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=client_key)
