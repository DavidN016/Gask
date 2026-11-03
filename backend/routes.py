from datetime import datetime, timezone

from flask import Blueprint, abort, current_app, jsonify, request

from . import db, pricing

bp = Blueprint("api", __name__, url_prefix="/api")

FUEL_TYPES = ("regular", "midgrade", "premium", "diesel")
SORTS = ("price", "distance", "value")
METERS_PER_MILE = 1609.344
# Places caps a search circle at 50 km.
MAX_RADIUS_MILES = 31
DEFAULT_RADIUS_MILES = 5
DEFAULT_GALLONS = 12
MAX_HISTORY_DAYS = 365
MAX_QUERY_LENGTH = 200
STATION_NOT_FOUND = "station not found; it appears here after showing up in a nearby search"


def _number(name, low, high, default=None, cast=float):
    raw = request.args.get(name)
    if raw is None:
        if default is None:
            abort(400, f"{name} is required")
        return default
    try:
        value = cast(raw)
    except ValueError:
        abort(400, f"{name} must be a number")
    if not low <= value <= high:
        abort(400, f"{name} must be between {low} and {high}")
    return value


def _choice(name, options, default):
    value = request.args.get(name, default).lower()
    if value not in options:
        abort(400, f"{name} must be one of: {', '.join(options)}")
    return value


def _fetch_stations(lat, lng, radius_miles):
    """Return raw stations and whether they came from the cache. Only fresh results are saved."""
    cache = current_app.extensions["places_cache"]
    # Three decimals is about 100 m, close enough to share one Places call.
    key = (round(lat, 3), round(lng, 3), radius_miles)
    stations = cache.get(key)
    if stations is not None:
        return stations, True
    client = current_app.extensions["places_client"]
    stations = client.search_nearby(key[0], key[1], radius_miles * METERS_PER_MILE)
    db.save_stations(db.get_db(), stations)
    cache.set(key, stations)
    return stations, False


def _present(station, lat, lng, fuel):
    quote = station["prices"].get(fuel)
    return {
        "id": station["id"],
        "name": station["name"],
        "address": station["address"],
        "lat": station["lat"],
        "lng": station["lng"],
        "distance_miles": round(pricing.distance_miles(lat, lng, station["lat"], station["lng"]), 2),
        "price": quote["price"] if quote else None,
        "currency": quote["currency"] if quote else None,
        "price_updated_at": quote["updated_at"] if quote else None,
        "prices": station["prices"],
    }


def _sort_key(sort):
    # Stations with no price for the chosen fuel sort last, except when sorting by distance.
    if sort == "distance":
        return lambda s: s["distance_miles"]
    if sort == "value":
        return lambda s: (s["price"] is None, s["trip"]["total_cost"] if s["price"] is not None else 0)
    return lambda s: (s["price"] is None, s["price"] or 0, s["distance_miles"])


@bp.get("/health")
def health():
    return jsonify(status="ok")


@bp.get("/geocode")
def geocode():
    query = " ".join(request.args.get("q", "").split())
    if not query or len(query) > MAX_QUERY_LENGTH:
        abort(400, f"q is required and must be at most {MAX_QUERY_LENGTH} characters")
    cache = current_app.extensions["places_cache"]
    key = ("geocode", query.lower())
    match = cache.get(key)
    if match is None:
        match = current_app.extensions["places_client"].geocode(query)
        if match is None:
            abort(404, "no location matches that search")
        cache.set(key, match)
    return jsonify(match)


@bp.get("/stations/nearby")
def nearby_stations():
    lat = _number("lat", -90, 90)
    lng = _number("lng", -180, 180)
    radius_miles = _number("radius_miles", 0.1, MAX_RADIUS_MILES, default=DEFAULT_RADIUS_MILES)
    fuel = _choice("fuel", FUEL_TYPES, "regular")
    sort = _choice("sort", SORTS, "price")
    mpg = _number("mpg", 1, 200) if "mpg" in request.args else None
    gallons = _number("gallons", 0.5, 100, default=DEFAULT_GALLONS)
    if sort == "value" and mpg is None:
        abort(400, "sort=value requires mpg")

    raw, cached = _fetch_stations(lat, lng, radius_miles)
    stations = [_present(s, lat, lng, fuel) for s in raw]
    stations = [s for s in stations if s["distance_miles"] <= radius_miles]
    if mpg is not None:
        pricing.add_trip_estimates(stations, mpg, gallons)
    stations.sort(key=_sort_key(sort))

    return jsonify(
        location={"lat": lat, "lng": lng},
        radius_miles=radius_miles,
        fuel=fuel,
        sort=sort,
        cached=cached,
        retrieved_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        summary=pricing.summarize(stations),
        stations=stations,
    )


@bp.get("/stations/<station_id>")
def station_detail(station_id):
    station = db.get_station(db.get_db(), station_id)
    if station is None:
        abort(404, STATION_NOT_FOUND)
    return jsonify(station)


@bp.get("/stations/<station_id>/prices")
def station_price_history(station_id):
    fuel = _choice("fuel", FUEL_TYPES, "regular")
    days = _number("days", 1, MAX_HISTORY_DAYS, default=30, cast=int)
    conn = db.get_db()
    if db.get_station(conn, station_id) is None:
        abort(404, STATION_NOT_FOUND)
    return jsonify(
        station_id=station_id,
        fuel=fuel,
        days=days,
        history=db.get_price_history(conn, station_id, fuel, days),
    )
