"""
Per-client rate limiting for the auth endpoints.

One shared ``Limiter`` (slowapi), keyed by the caller's IP. Storage defaults
to in-process (``limits`` MemoryStorage) — correct for a single instance and
a no-op to reason about. Set ``REDIS_URL`` to point it at Redis instead
(needed once more than one API process is running, since each process would
otherwise keep its own counters); slowapi's checks are synchronous either
way, so a Redis-backed limit adds one small blocking round-trip per
rate-limited request — negligible over a loopback/docker-network connection,
but worth knowing if this ever needs to move off a fast local link.

Used as a decorator on the routes that need it — see ``modules/auth/router.py``.
``main.py`` registers ``limiter`` on ``app.state`` and the 429 handler.
"""

from __future__ import annotations

import hmac

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from binx_api.core.config import get_settings

_settings = get_settings()


# Sent by binx-web's server on every call it makes on a visitor's behalf
# (binx-web lib/client-ip.ts). Nearly all API traffic arrives that way, so
# without it every visitor would share binx-web's own address — and one
# bucket: 10 logins a minute, 5 password resets an hour, for everyone.
CLIENT_IP_HEADER = "x-binx-client-ip"
PROXY_SECRET_HEADER = "x-binx-proxy-secret"


def _client_ip(request: Request) -> str:
    """The real client IP.

    1. When ``PROXY_SHARED_SECRET`` is set and the request carries it,
       ``X-Binx-Client-IP`` — the visitor binx-web is calling for.
    2. Otherwise the first ``X-Forwarded-For`` hop. Caddy (deploy/Caddyfile)
       replaces any client-sent X-Forwarded-For with the TCP peer it saw, so
       this can't be spoofed as long as the API is only reachable through
       Caddy (port 8000 isn't published in docker-compose.prod.yml).
    3. The socket peer, when neither header is there (local dev, tests).
    """
    secret = _settings.proxy_shared_secret
    if secret:
        given = request.headers.get(PROXY_SECRET_HEADER, "")
        forwarded_ip = request.headers.get(CLIENT_IP_HEADER, "").strip()
        if forwarded_ip and hmac.compare_digest(given.encode(), secret.encode()):
            return forwarded_ip[:64]
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return get_remote_address(request)


limiter = Limiter(
    key_func=_client_ip,
    enabled=_settings.rate_limit_enabled,
    storage_uri=_settings.redis_url,
)
