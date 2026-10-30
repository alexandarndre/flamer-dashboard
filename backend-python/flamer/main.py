import os
from collections.abc import Mapping
from pathlib import Path

from fastapi import FastAPI

from flamer.app import create_app
from flamer.scope import Services
from flamer.store.memory import MemoryStores
from flamer.store.postgres import PostgresStores, create_engine


def create_app_from_env(environ: Mapping[str, str] = os.environ) -> FastAPI:
    static_dir = Path(environ.get("STATIC_DIR", "/app/dist"))
    sandboxes = environ.get("FLAMER_SANDBOXES") != "off"
    database_url = environ.get("DATABASE_URL", "")
    if database_url == "":
        return create_app(Services(stores=MemoryStores(), sandboxes=sandboxes), static_dir=static_dir)
    engine = create_engine(database_url)
    return create_app(
        Services(stores=PostgresStores(engine), sandboxes=sandboxes), static_dir=static_dir, on_shutdown=engine.dispose
    )


app = create_app_from_env()
