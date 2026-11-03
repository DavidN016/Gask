import pytest

from backend import create_app
from backend.places import PlacesError, PlacesNotConfigured

from .conftest import FakePlaces, iso_ago, make_station, quote

SF = {"lat": 37.7749, "lng": -122.4194}


def nearby(client, **params):
    return client.get("/api/stations/nearby", query_string={**SF, **params})


def ids(response):
    return [s["id"] for s in response.get_json()["stations"]]


def test_health(client):
    assert client.get("/api/health").get_json() == {"status": "ok"}


def test_geocode(client):
    body = client.get("/api/geocode", query_string={"q": "San Francisco"}).get_json()
    assert body == {"lat": 37.7749, "lng": -122.4194, "address": "San Francisco, CA, USA"}


def test_geocode_caches_ignoring_case_and_spacing(client, places):
    client.get("/api/geocode", query_string={"q": "San Francisco"})
    client.get("/api/geocode", query_string={"q": "  san   francisco "})
    assert places.calls == ["San Francisco"]


def test_geocode_no_match_returns_404(client):
    response = client.get("/api/geocode", query_string={"q": "nowhere at all"})
    assert response.status_code == 404
    assert "error" in response.get_json()


@pytest.mark.parametrize("query", ["", "   ", "x" * 201])
def test_geocode_rejects_bad_query(client, places, query):
    assert client.get("/api/geocode", query_string={"q": query}).status_code == 400
    assert places.calls == []


def test_sorts_by_price_with_unpriced_last(client):
    response = nearby(client, radius_miles=31)
    assert response.status_code == 200
    assert ids(response) == ["cheap-far", "mid", "near", "unpriced"]


def test_sorts_by_distance(client):
    assert ids(nearby(client, sort="distance", radius_miles=31)) == ["unpriced", "near", "mid", "cheap-far"]


def test_price_follows_requested_fuel(client):
    stations = nearby(client, fuel="premium", radius_miles=31).get_json()["stations"]
    assert stations[0]["id"] == "near"
    assert stations[0]["price"] == 5.30
    assert all(s["price"] is None for s in stations[1:])


def test_summary(client):
    summary = nearby(client, radius_miles=31).get_json()["summary"]
    assert summary["station_count"] == 4
    assert summary["priced_count"] == 3
    assert summary["lowest_price"] == 4.50
    assert summary["average_price"] == 4.633
    assert summary["cheapest_station_id"] == "cheap-far"
    assert summary["best_value_station_id"] is None


def test_filters_stations_outside_radius(client):
    # cheap-far is about 8.2 miles from the search center.
    assert "cheap-far" not in ids(nearby(client, radius_miles=5))


def test_all_stations_unpriced(tmp_path):
    fake = FakePlaces([make_station("a", "A", 0.001, {})])
    app = create_app({"DATABASE": str(tmp_path / "t.db"), "PLACES_CLIENT": fake})
    body = app.test_client().get("/api/stations/nearby", query_string=SF).get_json()
    assert body["summary"]["lowest_price"] is None
    assert body["stations"][0]["price"] is None


def test_detour_cost_can_make_cheapest_station_not_worth_it(client):
    body = nearby(client, mpg=25, gallons=10, radius_miles=31, sort="value").get_json()
    by_id = {s["id"]: s for s in body["stations"]}
    assert body["summary"]["cheapest_station_id"] == "cheap-far"
    assert body["summary"]["best_value_station_id"] == "mid"
    assert body["stations"][0]["id"] == "mid"
    assert by_id["near"]["trip"]["net_savings_vs_nearest"] == 0
    assert by_id["mid"]["trip"]["net_savings_vs_nearest"] > 0
    assert by_id["cheap-far"]["trip"]["net_savings_vs_nearest"] < 0
    assert "trip" not in by_id["unpriced"]


@pytest.mark.parametrize(
    "params",
    [
        {"lat": "abc"},
        {"lat": "nan"},
        {"lat": "91"},
        {"lng": "-181"},
        {"radius_miles": "0"},
        {"radius_miles": "32"},
        {"fuel": "e85"},
        {"sort": "name"},
        {"sort": "value"},
        {"mpg": "0"},
        {"mpg": "inf"},
    ],
)
def test_rejects_bad_params(client, places, params):
    response = nearby(client, **params)
    assert response.status_code == 400
    assert "error" in response.get_json()
    assert places.calls == []


def test_requires_location(client):
    assert client.get("/api/stations/nearby").status_code == 400


def test_repeat_search_uses_cache(client, places):
    assert nearby(client).get_json()["cached"] is False
    assert nearby(client).get_json()["cached"] is True
    assert len(places.calls) == 1


def test_cached_results_keep_distances_from_exact_location(client, places):
    nearby(client, sort="distance")
    moved = client.get(
        "/api/stations/nearby",
        query_string={"lat": 37.7751, "lng": -122.4194, "sort": "distance"},
    ).get_json()
    assert moved["cached"] is True
    assert moved["location"]["lat"] == 37.7751
    assert len(places.calls) == 1


def test_different_radius_is_a_new_search(client, places):
    nearby(client, radius_miles=5)
    nearby(client, radius_miles=10)
    assert len(places.calls) == 2


def test_places_failure_returns_502(tmp_path):
    fake = FakePlaces(error=PlacesError("Google Places returned HTTP 500"))
    app = create_app({"DATABASE": str(tmp_path / "t.db"), "PLACES_CLIENT": fake})
    response = app.test_client().get("/api/stations/nearby", query_string=SF)
    assert response.status_code == 502
    assert "error" in response.get_json()


def test_missing_api_key_returns_503(tmp_path):
    fake = FakePlaces(error=PlacesNotConfigured("GOOGLE_PLACES_API_KEY is not set"))
    app = create_app({"DATABASE": str(tmp_path / "t.db"), "PLACES_CLIENT": fake})
    assert app.test_client().get("/api/stations/nearby", query_string=SF).status_code == 503


def test_frontend_origin_allowed(client):
    assert client.get("/api/health").headers["Access-Control-Allow-Origin"] == "http://localhost:3000"


def test_station_detail_after_search(client):
    nearby(client, radius_miles=31)
    body = client.get("/api/stations/near").get_json()
    assert body["name"] == "Near"
    assert body["prices"]["regular"]["price"] == 4.80
    assert body["prices"]["premium"]["price"] == 5.30


def test_unknown_station_returns_404(client):
    assert client.get("/api/stations/missing").status_code == 404
    assert client.get("/api/stations/missing/prices").status_code == 404


def test_detail_shows_latest_price_and_history_is_ordered(tmp_path):
    def station(price, updated_at):
        return make_station("s", "S", 0.001, {"regular": quote(price, updated_at)})

    fake = FakePlaces([station(4.70, iso_ago(days=3))])
    app = create_app({"DATABASE": str(tmp_path / "t.db"), "PLACES_CLIENT": fake})
    client = app.test_client()

    client.get("/api/stations/nearby", query_string=SF)
    fake.stations = [station(4.40, iso_ago(hours=1))]
    client.get("/api/stations/nearby", query_string={**SF, "radius_miles": 6})
    fake.stations = [station(4.90, iso_ago(days=40))]
    client.get("/api/stations/nearby", query_string={**SF, "radius_miles": 7})

    assert client.get("/api/stations/s").get_json()["prices"]["regular"]["price"] == 4.40
    history = client.get("/api/stations/s/prices", query_string={"days": 30}).get_json()["history"]
    assert [point["price"] for point in history] == [4.70, 4.40]


def test_same_google_update_is_not_recorded_twice(tmp_path):
    stamp = iso_ago(hours=2)
    fake = FakePlaces([make_station("s", "S", 0.001, {"regular": quote(4.70, stamp)})])
    app = create_app({"DATABASE": str(tmp_path / "t.db"), "PLACES_CLIENT": fake})
    client = app.test_client()
    client.get("/api/stations/nearby", query_string=SF)
    client.get("/api/stations/nearby", query_string={**SF, "radius_miles": 6})
    assert len(client.get("/api/stations/s/prices").get_json()["history"]) == 1


def test_history_rejects_bad_params(client):
    nearby(client, radius_miles=31)
    assert client.get("/api/stations/near/prices", query_string={"days": "0"}).status_code == 400
    assert client.get("/api/stations/near/prices", query_string={"days": "1.5"}).status_code == 400
    assert client.get("/api/stations/near/prices", query_string={"fuel": "e85"}).status_code == 400
