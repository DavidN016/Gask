import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from . import db, routes
from .cache import TTLCache
from .places import PlacesClient, PlacesError, PlacesNotConfigured

ROOT = Path(__file__).resolve().parent.parent
PLACES_CACHE_SECONDS = 300


def create_app(overrides=None):
    load_dotenv(ROOT / ".env")

    app = Flask(__name__)
    app.json.sort_keys = False
    app.config.update(
        DATABASE=os.environ.get("GASK_DB_PATH", str(ROOT / "gask.db")),
        CORS_ORIGIN=os.environ.get("GASK_CORS_ORIGIN", "http://localhost:3000"),
        PLACES_CLIENT=None,
    )
    app.config.update(overrides or {})

    db.init_db(app.config["DATABASE"])
    app.teardown_appcontext(db.close_db)
    app.extensions["places_client"] = app.config["PLACES_CLIENT"] or PlacesClient(
        os.environ.get("GOOGLE_PLACES_API_KEY")
    )
    app.extensions["places_cache"] = TTLCache(PLACES_CACHE_SECONDS)
    app.register_blueprint(routes.bp)

    @app.after_request
    def allow_frontend(response):
        response.headers["Access-Control-Allow-Origin"] = app.config["CORS_ORIGIN"]
        return response

    @app.errorhandler(HTTPException)
    def http_error(exc):
        return jsonify(error=exc.description), exc.code

    @app.errorhandler(PlacesNotConfigured)
    def places_not_configured(exc):
        return jsonify(error=str(exc)), 503

    @app.errorhandler(PlacesError)
    def places_error(exc):
        return jsonify(error=str(exc)), 502

    return app
