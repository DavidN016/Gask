CREATE TABLE IF NOT EXISTS stations (
    id            TEXT PRIMARY KEY,  -- Google place ID
    name          TEXT NOT NULL,
    address       TEXT,
    lat           REAL NOT NULL,
    lng           REAL NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL
);

-- Google timestamps each price, so one row per station, fuel, and update time
-- keeps repeat searches from duplicating history.
CREATE TABLE IF NOT EXISTS price_snapshots (
    id               INTEGER PRIMARY KEY,
    station_id       TEXT NOT NULL REFERENCES stations (id),
    fuel_type        TEXT NOT NULL,
    price            REAL NOT NULL,
    currency         TEXT NOT NULL,
    price_updated_at TEXT NOT NULL,
    recorded_at      TEXT NOT NULL,
    UNIQUE (station_id, fuel_type, price_updated_at)
);
