"""Unit tests for ``binx_api.modules.leads.places`` — the Google Places
client wrapper. ``_call_places`` is monkeypatched throughout, mirroring how
``ai/client.py::_call_anthropic`` is patched in the AI tests, so nothing here
makes a real network call.
"""

from __future__ import annotations

import httpx
import pytest

from binx_api.modules.leads import places

pytestmark = pytest.mark.unit


def _configure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(places.settings, "google_places_api_key", "test-places-key")


class TestIsConfigured:
    def test_unset_key_is_not_configured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(places.settings, "google_places_api_key", None)
        assert places.is_configured() is False

    def test_set_key_is_configured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        assert places.is_configured() is True


class TestSearchPlaces:
    async def test_unconfigured_returns_empty_without_calling_out(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(places.settings, "google_places_api_key", None)
        called = False

        async def _call(**kwargs):
            nonlocal called
            called = True
            return {}

        monkeypatch.setattr(places, "_call_places", _call)

        results = await places.search_places(query="marketing agencies in Austin, TX")
        assert results == []
        assert called is False

    async def test_blank_query_returns_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        results = await places.search_places(query="   ")
        assert results == []

    async def test_parses_real_results(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)

        async def _call(**kwargs):
            assert kwargs["headers"]["X-Goog-Api-Key"] == "test-places-key"
            assert kwargs["json"]["textQuery"] == "bakeries in Portland"
            return {
                "places": [
                    {
                        "displayName": {"text": "Northwind Bakery"},
                        "websiteUri": "https://northwind.example",
                        "nationalPhoneNumber": "555-0100",
                        "formattedAddress": "123 Main St, Portland, OR",
                        "id": "place-1",
                    },
                    {"displayName": {"text": ""}},  # no name — dropped
                ]
            }

        monkeypatch.setattr(places, "_call_places", _call)

        results = await places.search_places(query="bakeries in Portland", max_results=5)
        assert len(results) == 1
        assert results[0].name == "Northwind Bakery"
        assert results[0].website == "https://northwind.example"
        assert results[0].phone == "555-0100"
        assert results[0].address == "123 Main St, Portland, OR"
        assert results[0].place_id == "place-1"

    async def test_max_results_is_clamped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)

        async def _call(**kwargs):
            assert kwargs["json"]["maxResultCount"] == 20
            return {"places": []}

        monkeypatch.setattr(places, "_call_places", _call)

        await places.search_places(query="anything", max_results=999)

    async def test_a_request_failure_degrades_to_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)

        async def _call(**kwargs):
            raise httpx.ConnectError("boom", request=httpx.Request("POST", "https://places.googleapis.com"))

        monkeypatch.setattr(places, "_call_places", _call)

        results = await places.search_places(query="anything")
        assert results == []
