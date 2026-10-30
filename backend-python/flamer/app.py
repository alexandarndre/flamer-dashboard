from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Final

from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Receive, Send
from starlette.types import Scope as AsgiScope

from flamer.errors import install_error_handlers
from flamer.routes import router
from flamer.scope import Services

IMMUTABLE: Final = "public, max-age=31536000, immutable"
DESCRIPTION: Final = (
    "Simulated crawl backend for the content-ops dashboard. State is a pure function of each run’s spec, "
    "its operator actions and the (demo) clock."
)


class StripTrailingSlash:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: AsgiScope, receive: Receive, send: Send) -> None:
        path = scope.get("path")
        if scope["type"] == "http" and isinstance(path, str) and path.startswith("/api/") and path.endswith("/"):
            raw_path = scope.get("raw_path")
            scope = {
                **scope,
                "path": path[:-1],
                "raw_path": raw_path[:-1] if isinstance(raw_path, bytes) and raw_path.endswith(b"/") else raw_path,
            }
        await self.app(scope, receive, send)


class SpaStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: AsgiScope) -> Response:
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            response = await super().get_response("index.html", scope)
        if path.startswith("assets/") and response.status_code == 200:
            response.headers["cache-control"] = IMMUTABLE
        return response


def create_app(
    services: Services,
    *,
    static_dir: Path | None = None,
    on_shutdown: Callable[[], Awaitable[None]] | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        if on_shutdown is not None:
            await on_shutdown()

    app = FastAPI(
        title="Flamer crawl operations API",
        version="1.0.0",
        description=DESCRIPTION,
        openapi_url="/api/openapi.json",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.services = services
    app.add_middleware(StripTrailingSlash)

    install_error_handlers(app)
    app.include_router(router)
    if static_dir is not None and static_dir.is_dir():
        app.mount("/", SpaStaticFiles(directory=static_dir), name="spa")
    return app
