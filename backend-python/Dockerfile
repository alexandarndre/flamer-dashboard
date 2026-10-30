# syntax=docker/dockerfile:1

FROM node:25-alpine AS spa
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases .yarn/releases
RUN --mount=type=cache,target=/root/.yarn/berry/cache node .yarn/releases/yarn-*.cjs install --immutable
COPY . .
RUN node .yarn/releases/yarn-*.cjs build

FROM ghcr.io/astral-sh/uv:0.12.17 AS uv

FROM python:3.13-slim AS venv
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
COPY backend-python/pyproject.toml backend-python/uv.lock backend-python/.python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project --python /usr/local/bin/python3

FROM python:3.13-slim
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin flamer
WORKDIR /app
COPY --from=venv /app/.venv .venv
COPY backend-python/alembic.ini ./
COPY backend-python/migrations migrations
COPY backend-python/flamer flamer
COPY --from=spa /app/dist dist
ENV PATH=/app/.venv/bin:$PATH STATIC_DIR=/app/dist PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER flamer
EXPOSE 8000
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then alembic upgrade head; fi && exec uvicorn flamer.main:app --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 5"]
