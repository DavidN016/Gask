import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import current_app, g

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def connect(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(path):
    conn = connect(path)
    with conn:
        conn.executescript(SCHEMA_PATH.read_text())
    conn.close()


def get_db():
    if "db" not in g:
        g.db = connect(current_app.config["DATABASE"])
    return g.db


def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def save_stations(conn, stations):
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with conn:
        for station in stations:
            conn.execute(
                """
                INSERT INTO stations (id, name, address, lat, lng, first_seen_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    name = excluded.name,
                    address = excluded.address,
                    lat = excluded.lat,
                    lng = excluded.lng,
                    last_seen_at = excluded.last_seen_at
                """,
                (station["id"], station["name"], station["address"], station["lat"], station["lng"], now, now),
            )
            for fuel, quote in station["prices"].items():
                conn.execute(
                    """
                    INSERT OR IGNORE INTO price_snapshots
                        (station_id, fuel_type, price, currency, price_updated_at, recorded_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (station["id"], fuel, quote["price"], quote["currency"], quote["updated_at"], now),
                )


def get_station(conn, station_id):
    row = conn.execute(
        "SELECT id, name, address, lat, lng, last_seen_at FROM stations WHERE id = ?",
        (station_id,),
    ).fetchone()
    if row is None:
        return None
    # SQLite takes the bare columns from the row holding MAX(), giving the latest price per fuel.
    rows = conn.execute(
        """
        SELECT fuel_type, price, currency, price_updated_at, MAX(datetime(price_updated_at))
        FROM price_snapshots
        WHERE station_id = ?
        GROUP BY fuel_type
        """,
        (station_id,),
    ).fetchall()
    station = dict(row)
    station["prices"] = {
        r["fuel_type"]: {"price": r["price"], "currency": r["currency"], "updated_at": r["price_updated_at"]}
        for r in rows
    }
    return station


def get_price_history(conn, station_id, fuel, days):
    rows = conn.execute(
        """
        SELECT price, currency, price_updated_at AS updated_at
        FROM price_snapshots
        WHERE station_id = ?
          AND fuel_type = ?
          AND datetime(price_updated_at) >= datetime('now', ?)
        ORDER BY datetime(price_updated_at)
        """,
        (station_id, fuel, f"-{days} days"),
    ).fetchall()
    return [dict(r) for r in rows]
