import pytest
import requests

from backend import places
from backend.places import PlacesClient, PlacesError, PlacesNotConfigured, parse_place

PLACE = {
    "id": "abc",
    "displayName": {"text": "Shell"},
    "formattedAddress": "1 Main St",
    "location": {"latitude": 37.0, "longitude": -122.0},
    "fuelOptions": {
        "fuelPrices": [
            {
                "type": "REGULAR_UNLEADED",
                "price": {"currencyCode": "USD", "units": "4", "nanos": 299000000},
                "updateTime": "2026-11-02T10:00:00Z",
            },
            {
                "type": "DIESEL",
                "price": {"currencyCode": "USD", "units": "5"},
                "updateTime": "2026-11-02T10:00:00Z",
            },
            {"type": "PREMIUM"},
        ]
    },
}


class FakeResponse:
    def __init__(self, status, body):
        self.status_code = status
        self.ok = status < 400
        self.text = str(body)
        self._body = body

    def json(self):
        return self._body


def test_parse_place():
    assert parse_place(PLACE) == {
        "id": "abc",
        "name": "Shell",
        "address": "1 Main St",
        "lat": 37.0,
        "lng": -122.0,
        "prices": {
            "regular": {"price": 4.299, "currency": "USD", "updated_at": "2026-11-02T10:00:00Z"},
            "diesel": {"price": 5.0, "currency": "USD", "updated_at": "2026-11-02T10:00:00Z"},
        },
    }


def test_parse_place_without_fuel_options():
    place = {"id": "x", "location": {"latitude": 1.0, "longitude": 2.0}}
    assert parse_place(place)["prices"] == {}


def test_sends_key_in_header_and_requests_gas_stations(monkeypatch):
    seen = {}

    def fake_post(url, headers, json, timeout):
        seen.update(url=url, headers=headers, body=json)
        return FakeResponse(200, {"places": [PLACE]})

    monkeypatch.setattr(places.requests, "post", fake_post)
    result = PlacesClient("secret").search_nearby(37.0, -122.0, 8000)

    assert result[0]["id"] == "abc"
    assert "secret" not in seen["url"]
    assert seen["headers"]["X-Goog-Api-Key"] == "secret"
    assert "places.fuelOptions" in seen["headers"]["X-Goog-FieldMask"]
    assert seen["body"]["includedTypes"] == ["gas_station"]
    assert seen["body"]["locationRestriction"]["circle"]["radius"] == 8000


def test_geocode_returns_best_match(monkeypatch):
    seen = {}

    def fake_post(url, headers, json, timeout):
        seen.update(url=url, body=json)
        return FakeResponse(200, {"places": [PLACE]})

    monkeypatch.setattr(places.requests, "post", fake_post)
    assert PlacesClient("k").geocode("Main St") == {"lat": 37.0, "lng": -122.0, "address": "1 Main St"}
    assert seen["url"].endswith("places:searchText")
    assert seen["body"]["textQuery"] == "Main St"


def test_geocode_without_match_returns_none(monkeypatch):
    monkeypatch.setattr(places.requests, "post", lambda *a, **k: FakeResponse(200, {}))
    assert PlacesClient("k").geocode("nowhere") is None


def test_empty_response_means_no_stations(monkeypatch):
    monkeypatch.setattr(places.requests, "post", lambda *a, **k: FakeResponse(200, {}))
    assert PlacesClient("k").search_nearby(1, 2, 3) == []


def test_http_error_raises(monkeypatch):
    monkeypatch.setattr(places.requests, "post", lambda *a, **k: FakeResponse(403, {"error": "denied"}))
    with pytest.raises(PlacesError, match="403"):
        PlacesClient("k").search_nearby(1, 2, 3)


def test_network_error_raises(monkeypatch):
    def boom(*a, **k):
        raise requests.ConnectionError("down")

    monkeypatch.setattr(places.requests, "post", boom)
    with pytest.raises(PlacesError):
        PlacesClient("k").search_nearby(1, 2, 3)


def test_missing_key_raises_without_calling_google(monkeypatch):
    def fail(*a, **k):
        raise AssertionError("should not call Google")

    monkeypatch.setattr(places.requests, "post", fail)
    with pytest.raises(PlacesNotConfigured):
        PlacesClient(None).search_nearby(1, 2, 3)
