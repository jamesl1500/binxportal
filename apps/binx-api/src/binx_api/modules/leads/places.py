"""Thin, monkeypatchable wrapper around the Google Places API (Text Search,
new) — the AI prospector's optional second lead source alongside Claude web
search. See ai/service.py::find_prospects for how results from here get fed
into that prompt as verified ground truth.

Mirrors ai/client.py's shape: ``is_configured``/off-by-default like
``AiNotConfigured``, and one thin ``_call_places`` wrapping the only real
network call this module makes, so tests can monkeypatch it the same way
they monkeypatch ``ai/client.py::_call_anthropic``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from binx_api.core.config import get_settings

settings = get_settings()

_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
_FIELD_MASK = "places.displayName,places.websiteUri,places.nationalPhoneNumber,places.formattedAddress,places.id"


@dataclass
class PlaceResult:
    name: str
    website: str | None = None
    phone: str | None = None
    address: str | None = None
    place_id: str | None = None


def is_configured() -> bool:
    return bool(settings.google_places_api_key)


async def _call_places(**kwargs: Any) -> dict:
    """Thin, monkeypatchable wrapper around the one real network call this
    module makes — mirrors ai/client.py::_call_anthropic."""
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        response = await http_client.post(_SEARCH_URL, **kwargs)
        response.raise_for_status()
        return response.json()


async def search_places(*, query: str, max_results: int = 10) -> list[PlaceResult]:
    """Text Search for businesses matching ``query`` (the caller folds
    industry/location/radius into one query string — see find_prospects).

    Returns ``[]`` whenever Places isn't configured, and also swallows any
    request/HTTP failure into ``[]`` rather than raising — Places is an
    optional grounding source for find_prospects, never a hard requirement,
    so an outage or bad key degrades to today's web-search-only behavior
    instead of failing the whole prospecting run.
    """
    if not is_configured() or not query.strip():
        return []

    capped = max(1, min(20, max_results))
    headers = {
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
        "Content-Type": "application/json",
    }
    try:
        data = await _call_places(json={"textQuery": query, "maxResultCount": capped}, headers=headers)
    except (httpx.HTTPError, ValueError):
        return []

    results: list[PlaceResult] = []
    for place in (data.get("places") or [])[:capped]:
        display_name = str((place.get("displayName") or {}).get("text") or "").strip()
        if not display_name:
            continue
        results.append(
            PlaceResult(
                name=display_name,
                website=place.get("websiteUri") or None,
                phone=place.get("nationalPhoneNumber") or None,
                address=place.get("formattedAddress") or None,
                place_id=place.get("id") or None,
            )
        )
    return results
