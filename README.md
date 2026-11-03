# Gask

A gas-price comparison app with a Next.js frontend and a Flask API that serves live prices from Google Places.

## Run locally

The frontend needs the backend running, so start each in its own terminal. Backend setup is below.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Run `npm run build` for a production build, or `npm run typecheck` to check TypeScript.

The frontend calls the API at `http://127.0.0.1:5000`. Set `NEXT_PUBLIC_GASK_API_URL` to use a different address.

## Features

- Location search by city, address, or ZIP, plus browser geolocation
- Live prices by fuel type, distance filtering, and sorting by price or distance
- Saved stations persisted in local storage
- Relative map of nearby stations linked to station selection (not a street map)
- Directions through Google Maps
- Responsive desktop and mobile layouts

## Backend

A Flask API that serves live prices from Google Places and stores them in SQLite (`gask.db`). Put `GOOGLE_PLACES_API_KEY` in `.env`, then:

```sh
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
flask --app backend run
pytest
```

Optional settings: `GASK_DB_PATH` and `GASK_CORS_ORIGIN` (default `http://localhost:3000`).

### Endpoints

| Endpoint | Description |
| --- | --- |
| `GET /api/geocode?q=` | Coordinates for a city, address, or ZIP |
| `GET /api/stations/nearby` | Stations and prices around a location |
| `GET /api/stations/<id>` | A saved station with its latest price per fuel |
| `GET /api/stations/<id>/prices` | Saved price history; takes `fuel` (default `regular`) and `days` (default 30, max 365) |
| `GET /api/health` | Health check |

`/api/stations/nearby` parameters:

| Parameter | Default | Description |
| --- | --- | --- |
| `lat`, `lng` | required | The user's location |
| `radius_miles` | 5 | Search radius, up to 31 |
| `fuel` | `regular` | `regular`, `midgrade`, `premium`, or `diesel` |
| `sort` | `price` | `price`, `distance`, or `value` (`value` requires `mpg`) |
| `mpg` | none | Adds a `trip` cost estimate to each priced station |
| `gallons` | 12 | Fill-up size used by the estimate |

Things to know when using the results:

- Google returns at most 20 stations, nearest first, so in dense areas results may not reach the full radius.
- Not every station has prices. Those stations have `price: null` and sort last, except in `sort=distance`.
- `distance_miles` is straight-line. The `trip` estimate assumes a round trip with distance multiplied by 1.3 for roads, and `net_savings_vs_nearest` compares against the nearest priced station.
- Identical searches within 5 minutes and about 100 m share one Google call, and `cached` says when this happened. The cache is in memory and resets on restart.
- History only exists for prices the API has already seen in a search.
