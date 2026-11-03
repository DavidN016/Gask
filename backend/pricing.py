from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_MILES = 3958.8
# Straight-line distance undercounts real driving; 1.3 is a common rule of thumb for road networks.
ROAD_DISTANCE_FACTOR = 1.3


def distance_miles(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(radians, (lat1, lng1, lat2, lng2))
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * asin(sqrt(a))


def trip_estimate(price, miles_away, mpg, gallons):
    """Estimated cost to fill up here, counting the fuel burned driving there and back."""
    round_trip_miles = miles_away * ROAD_DISTANCE_FACTOR * 2
    fill_cost = price * gallons
    drive_cost = round_trip_miles / mpg * price
    return {
        "round_trip_miles": round(round_trip_miles, 2),
        "fill_cost": round(fill_cost, 2),
        "drive_cost": round(drive_cost, 2),
        "total_cost": round(fill_cost + drive_cost, 2),
    }


def add_trip_estimates(stations, mpg, gallons):
    """Attach an estimate to each priced station and compare it against the nearest priced one."""
    priced = [s for s in stations if s["price"] is not None]
    for station in priced:
        station["trip"] = trip_estimate(station["price"], station["distance_miles"], mpg, gallons)
    if priced:
        baseline = min(priced, key=lambda s: s["distance_miles"])["trip"]["total_cost"]
        for station in priced:
            station["trip"]["net_savings_vs_nearest"] = round(baseline - station["trip"]["total_cost"], 2)


def summarize(stations):
    priced = [s for s in stations if s["price"] is not None]
    summary = {
        "station_count": len(stations),
        "priced_count": len(priced),
        "lowest_price": None,
        "average_price": None,
        "cheapest_station_id": None,
        "best_value_station_id": None,
    }
    if priced:
        cheapest = min(priced, key=lambda s: (s["price"], s["distance_miles"]))
        summary["lowest_price"] = cheapest["price"]
        summary["average_price"] = round(sum(s["price"] for s in priced) / len(priced), 3)
        summary["cheapest_station_id"] = cheapest["id"]
        if "trip" in priced[0]:
            summary["best_value_station_id"] = min(priced, key=lambda s: s["trip"]["total_cost"])["id"]
    return summary
