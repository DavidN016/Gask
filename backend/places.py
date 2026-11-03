import logging
from datetime import datetime, timezone

import requests

log = logging.getLogger(__name__)

SEARCH_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.fuelOptions",
    ]
)
SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText"
GEOCODE_FIELD_MASK = "places.location,places.formattedAddress"
# Nearby Search has no pagination; 20 is the most a single request can return.
MAX_RESULTS = 20
TIMEOUT_SECONDS = 10

FUEL_NAMES = {"REGULAR_UNLEADED": "regular"}


class PlacesError(Exception):
    """Google Places could not be reached or rejected the request."""


class PlacesNotConfigured(PlacesError):
    """No API key is set."""


def parse_price(money):
    return round(int(money.get("units", 0)) + money.get("nanos", 0) / 1e9, 3)


def parse_place(place):
    prices = {}
    for entry in place.get("fuelOptions", {}).get("fuelPrices", []):
        money = entry.get("price")
        if not money or "type" not in entry:
            continue
        fuel = FUEL_NAMES.get(entry["type"], entry["type"].lower())
        prices[fuel] = {
            "price": parse_price(money),
            "currency": money.get("currencyCode", "USD"),
            "updated_at": entry.get("updateTime") or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
    return {
        "id": place["id"],
        "name": place.get("displayName", {}).get("text", "Gas station"),
        "address": place.get("formattedAddress"),
        "lat": place["location"]["latitude"],
        "lng": place["location"]["longitude"],
        "prices": prices,
    }


class PlacesClient:
    def __init__(self, api_key):
        self.api_key = api_key

    def _post(self, url, field_mask, body):
        if not self.api_key:
            raise PlacesNotConfigured("GOOGLE_PLACES_API_KEY is not set")
        try:
            response = requests.post(
                url,
                headers={"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": field_mask},
                json=body,
                timeout=TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            log.warning("Places request failed: %s", type(exc).__name__)
            raise PlacesError("could not reach Google Places") from exc
        if not response.ok:
            log.warning("Places returned %s: %s", response.status_code, response.text[:500])
            raise PlacesError(f"Google Places returned HTTP {response.status_code}")
        return response.json().get("places", [])

    def search_nearby(self, lat, lng, radius_meters):
        places = self._post(
            SEARCH_NEARBY_URL,
            FIELD_MASK,
            {
                "includedTypes": ["gas_station"],
                "maxResultCount": MAX_RESULTS,
                "rankPreference": "DISTANCE",
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": lat, "longitude": lng},
                        "radius": radius_meters,
                    }
                },
            },
        )
        return [parse_place(place) for place in places]

    def geocode(self, query):
        """Return the best match for a city, address, or ZIP, or None if nothing matches."""
        places = self._post(SEARCH_TEXT_URL, GEOCODE_FIELD_MASK, {"textQuery": query, "pageSize": 1})
        if not places:
            return None
        return {
            "lat": places[0]["location"]["latitude"],
            "lng": places[0]["location"]["longitude"],
            "address": places[0].get("formattedAddress", query),
        }
