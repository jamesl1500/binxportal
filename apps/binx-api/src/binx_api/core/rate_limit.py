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

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from binx_api.core.config import get_settings

_settings = get_settings()


def _client_ip(request: Request) -> str:
    """The real client IP. Behind a reverse proxy / CDN that sets it, the first
    ``X-Forwarded-For`` hop is the client; otherwise fall back to the socket
    peer. Spoofing ``X-Forwarded-For`` when there is no trusted proxy in front
    only lets an attacker dodge their *own* limit — legitimate traffic, which
    doesn't send the header, stays protected."""
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
