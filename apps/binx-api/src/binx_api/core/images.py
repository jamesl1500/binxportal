"""Shared helpers for validating and storing the small branded images the app
lets people upload (agency logo/cover, client portal logo, and now a user's
own avatar/cover) — extracted out of agencies/service.py once user profiles
became a third caller, to avoid every caller re-deriving the same mime/size
rules and to sidestep a circular import (agencies/service.py already imports
from modules.users, so modules.users can't import back from it)."""

import hashlib
from pathlib import Path

from fastapi import HTTPException, status

from binx_api.core.config import get_settings

settings = get_settings()

# Shown inline in the app chrome and profile/settings pages — keep this list
# to what a browser renders reliably.
ALLOWED_IMAGE_MIME_TYPES: set[str] = {"image/jpeg", "image/png", "image/webp", "image/gif"}
IMAGE_EXTENSIONS: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def validate_image(content: bytes, mime_type: str) -> None:
    if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a JPEG, PNG, WebP, or GIF image")
    if len(content) > settings.agency_image_max_bytes:
        max_mb = settings.agency_image_max_bytes // (1024 * 1024)
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Images must be {max_mb}MB or smaller")


def unlink_quietly(storage_path: str) -> None:
    """Best-effort delete of an image's bytes — a filesystem hiccup should
    never block clearing the row that points at them."""
    try:
        Path(storage_path).unlink(missing_ok=True)
    except OSError:
        pass


def image_version(storage_path: str | None) -> str | None:
    """A short, stable-per-file token the frontend appends as ?v= so a
    re-uploaded image (new path) isn't hidden by a stale browser cache."""
    if not storage_path:
        return None
    return hashlib.sha1(storage_path.encode("utf-8")).hexdigest()[:12]  # noqa: S324 - cache-bust only
