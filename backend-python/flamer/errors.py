import logging
from collections.abc import Sequence
from typing import Final

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError

from flamer.contract import ACTION_TYPES, ApiError, InvalidDomain, IssueTree

logger = logging.getLogger(__name__)

NO_STORE: Final = {"cache-control": "no-store"}


class HttpError(Exception):
    def __init__(self, status: int, message: str, issues: IssueTree | list[InvalidDomain] | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.issues = issues


def error_response(status: int, error: ApiError) -> Response:
    return Response(
        error.model_dump_json(exclude_unset=True), status_code=status, media_type="application/json", headers=NO_STORE
    )


def issue_tree(errors: Sequence[object], body: object) -> IssueTree:
    tree = IssueTree(errors=[])
    tag = body.get("type") if isinstance(body, dict) else None
    for error in errors:
        if not isinstance(error, dict):
            continue
        loc = [part for part in error.get("loc", ()) if isinstance(part, str | int)]
        if loc[:1] == ["body"]:
            loc = loc[1:]
        if error.get("type") in ("union_tag_invalid", "union_tag_not_found"):
            loc = ["type"]
        elif error.get("type") == "json_invalid":
            loc = []
        elif tag in ACTION_TYPES and loc[:1] == [tag]:
            loc = loc[1:]
        _insert(tree, loc, str(error.get("msg", "Invalid input")))
    return tree


def _insert(tree: IssueTree, path: Sequence[str | int], message: str) -> None:
    node = tree
    for key in path:
        if isinstance(key, int):
            items = [] if node.items is None else node.items
            items.extend([None] * (key + 1 - len(items)))
            child = items[key]
            if child is None:
                child = items[key] = IssueTree(errors=[])
            node.items = items
        else:
            properties = {} if node.properties is None else node.properties
            child = properties.setdefault(key, IssueTree(errors=[]))
            node.properties = properties
        node = child
    node.errors.append(message)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HttpError)
    async def http_error(_: Request, exc: HttpError) -> Response:
        error = ApiError(error=exc.message)
        if exc.issues is not None:
            error.issues = exc.issues
        return error_response(exc.status, error)

    @app.exception_handler(RequestValidationError)
    async def invalid_body(_: Request, exc: RequestValidationError) -> Response:
        return error_response(400, ApiError(error="Invalid request body", issues=issue_tree(exc.errors(), exc.body)))

    @app.exception_handler(Exception)
    async def internal_error(_: Request, exc: Exception) -> Response:
        logger.exception("Unhandled error", exc_info=exc)
        return error_response(500, ApiError(error=str(exc) or "Internal error"))
