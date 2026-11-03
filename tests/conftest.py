from datetime import datetime, timedelta, timezone

import pytest

from backend import create_app


def iso_ago(**kwargs):
    return (datetime.now(timezone.utc) - timedelta(**kwargs)).strftime("%Y-%m-%dT%H:%M:%SZ")


def quote(price, updated_at=None):
    return {"price": price, "currency": "USD", "updated_at": updated_at or iso_ago(hours=1)}


# Searches below center on (37.7749, -122.4194); longitude offsets give distance.
def make_station(station_id, name, lng_offset, prices):
    return {
        "id": station_id,
        "name": name,
        "address": f"{name} St",
        "lat": 37.7749,
        "lng": -122.4194 + lng_offset,
        "prices": prices,
    }


class FakePlaces:
    def __init__(self, stations=None, error=None):
        self.stations = stations if stations is not None else []
        self.error = error
        self.calls = []

    def search_nearby(self, lat, lng, radius_meters):
        self.calls.append((lat, lng, radius_meters))
        if self.error:
            raise self.error
        return self.stations

    def geocode(self, query):
        self.calls.append(query)
        if self.error:
            raise self.error
        if query.lower().startswith("nowhere"):
            return None
        return {"lat": 37.7749, "lng": -122.4194, "address": "San Francisco, CA, USA"}


@pytest.fixture
def places():
    return FakePlaces(
        [
            make_station("near", "Near", 0.005, {"regular": quote(4.80), "premium": quote(5.30)}),
            make_station("cheap-far", "CheapFar", 0.15, {"regular": quote(4.50)}),
            make_station("mid", "Mid", 0.02, {"regular": quote(4.60)}),
            make_station("unpriced", "Unpriced", 0.001, {}),
        ]
    )


@pytest.fixture
def client(places, tmp_path):
    app = create_app({"TESTING": True, "DATABASE": str(tmp_path / "test.db"), "PLACES_CLIENT": places})
    return app.test_client()
