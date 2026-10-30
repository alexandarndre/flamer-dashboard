from pathlib import Path

import httpx
import pytest

from flamer.app import create_app
from flamer.main import create_app_from_env
from flamer.scope import Services
from flamer.store.memory import MemoryStores

pytestmark = pytest.mark.anyio


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>Flamer</title>")
    (tmp_path / "assets" / "app-123.js").write_text("console.log('hi')")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    return tmp_path


async def _get(app_dir: Path, path: str, environ: dict[str, str] | None = None) -> httpx.Response:
    app = (
        create_app(Services(stores=MemoryStores()), static_dir=app_dir)
        if environ is None
        else create_app_from_env(environ)
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path, headers={"x-flamer-sandbox": "visitor0000001"})


async def test_serves_the_spa_with_immutable_assets(static_dir: Path) -> None:
    asset = await _get(static_dir, "/assets/app-123.js")
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert (await _get(static_dir, "/favicon.svg")).text == "<svg/>"
    for path in ("/", "/runs/run_igo_weekly", "/explore?focus=x"):
        page = await _get(static_dir, path)
        assert (page.status_code, page.text) == (200, "<!doctype html><title>Flamer</title>")
        assert "immutable" not in page.headers.get("cache-control", "")


async def test_keeps_the_api_out_of_the_spa_fallback(static_dir: Path) -> None:
    missing = await _get(static_dir, "/api/missing")
    assert (missing.status_code, missing.json()) == (404, {"error": "No route for GET /api/missing"})


async def test_configures_itself_from_the_environment(static_dir: Path) -> None:
    environ = {"STATIC_DIR": str(static_dir), "FLAMER_SANDBOXES": "off"}
    health = await _get(static_dir, "/api/health", environ)
    assert health.json()["store"] == "memory"
    demo = await _get(static_dir, "/api/demo", environ)
    assert demo.json()["sandbox"] is None
    assert (await _get(static_dir, "/", environ)).status_code == 200
