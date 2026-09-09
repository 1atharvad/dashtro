"""
DashTro CMS — MCP Server

Exposes the CMS SDK REST API (/api/sdk/*) as MCP tools so Claude (or any MCP
client) can read and write project content directly. Uses API-key auth only
(X-API-Key) — never a user's JWT — so what an MCP client can do is exactly
what the configured API key is scoped to (project/collections/read-write).

That also means tools with no API-key-authorized equivalent aren't exposed
here: listing all projects, listing/renaming individual schema fields,
push-to-production, and document version history are all admin (JWT-only)
operations on the /api/cms/* surface.

Configuration (env vars):
  CMS_API_URL       — base URL of the CMS backend's SDK API, e.g.
                      http://localhost:7312/api/sdk
  CMS_API_KEY       — API key for authenticated requests, scoped per collection
                      (read/write) from the CMS's settings page
  CMS_PROJECT_ID    — default project ID (optional, used when project_id not provided)
  MCP_RATE_LIMIT    — requests per minute (default: 60)
  MCP_MAX_BODY_SIZE — max request body bytes (default: 1048576 = 1MB)
  MCP_READ_ONLY     — "true" to disable write tools (default: false)
"""

import asyncio
import json
import math
import os
import random
import re
import time
from collections import defaultdict
from collections.abc import Callable
from functools import wraps
from typing import Any, Literal, TypeVar

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ── Retry & Circuit Breaker Configuration ────────────────────────────────────

MAX_RETRIES = int(os.environ.get("MCP_MAX_RETRIES", "3"))
BASE_RETRY_DELAY = float(os.environ.get("MCP_BASE_RETRY_DELAY", "0.5"))  # seconds
MAX_RETRY_DELAY = float(os.environ.get("MCP_MAX_RETRY_DELAY", "30.0"))  # seconds
RETRY_JITTER = float(os.environ.get("MCP_RETRY_JITTER", "0.1"))  # 10% jitter

# Circuit breaker settings
CIRCUIT_BREAKER_THRESHOLD = int(os.environ.get("MCP_CB_THRESHOLD", "5"))  # failures before opening
CIRCUIT_BREAKER_TIMEOUT = float(
    os.environ.get("MCP_CB_TIMEOUT", "30.0")
)  # seconds before half-open
CIRCUIT_BREAKER_HALF_OPEN_MAX = int(
    os.environ.get("MCP_CB_HALF_OPEN_MAX", "3")
)  # test requests in half-open

# Retryable HTTP status codes
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

T = TypeVar("T")


class CircuitBreakerOpen(Exception):
    """Raised when circuit breaker is open and requests are blocked."""

    def __init__(self, retry_after: float):
        self.retry_after = retry_after
        super().__init__(f"Circuit breaker open, retry after {retry_after:.1f}s")


class CircuitBreaker:
    """Simple circuit breaker to prevent cascading failures."""

    def __init__(
        self,
        failure_threshold: int = CIRCUIT_BREAKER_THRESHOLD,
        recovery_timeout: float = CIRCUIT_BREAKER_TIMEOUT,
        half_open_max: int = CIRCUIT_BREAKER_HALF_OPEN_MAX,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max = half_open_max
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: float | None = None
        self.state = "closed"  # closed, open, half-open

    def record_success(self) -> None:
        self.failure_count = 0
        if self.state == "half-open":
            self.success_count += 1
            if self.success_count >= self.half_open_max:
                self.state = "closed"
                self.success_count = 0

    def record_failure(self) -> None:
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.state == "half-open":
            self.state = "open"
            self.success_count = 0
        elif self.failure_count >= self.failure_threshold:
            self.state = "open"

    def can_execute(self) -> bool:
        if self.state == "closed":
            return True
        if self.state == "open":
            if (
                self.last_failure_time
                and (time.time() - self.last_failure_time) >= self.recovery_timeout
            ):
                self.state = "half-open"
                self.success_count = 0
                return True
            return False
        # half-open
        return True

    def get_retry_after(self) -> float:
        if self.state == "open" and self.last_failure_time:
            return max(0, self.recovery_timeout - (time.time() - self.last_failure_time))
        return 0


# Global circuit breaker instance (shared across all requests to the same backend)
_circuit_breaker = CircuitBreaker()


def _calculate_backoff(attempt: int) -> float:
    """Calculate exponential backoff with jitter."""
    delay = min(BASE_RETRY_DELAY * (2**attempt), MAX_RETRY_DELAY)
    jitter = delay * RETRY_JITTER * random.uniform(-1, 1)
    return max(0, delay + jitter)


async def _retry_async(
    func: Callable[..., T],
    *args: Any,
    max_retries: int = MAX_RETRIES,
    **kwargs: Any,
) -> T:
    """Execute async function with exponential backoff retry for transient failures."""
    last_exception: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except httpx.HTTPStatusError as e:
            last_exception = e
            if e.response.status_code not in RETRYABLE_STATUS_CODES:
                raise
            if attempt == max_retries:
                raise
        except (httpx.TimeoutException, httpx.NetworkError, httpx.ConnectError) as e:
            last_exception = e
            if attempt == max_retries:
                raise
        except CircuitBreakerOpen:
            # Don't retry circuit breaker errors - fail fast
            raise

        # Wait before retry
        delay = _calculate_backoff(attempt)
        await asyncio.sleep(delay)

    # This should never be reached, but satisfies type checker
    raise last_exception from last_exception


CMS_API_URL = os.environ.get("CMS_API_URL", "http://localhost:7312/api/sdk")
CMS_API_KEY = os.environ.get("CMS_API_KEY", "")
CMS_PROJECT_ID = os.environ.get("CMS_PROJECT_ID", "")

# ── Schema Field Validation (Pydantic model matching backend SchemaFieldIn) ──────

# From backend models/field_types.py - keep in sync
ALL_FIELD_TYPES = (
    "String",
    "Number",
    "Boolean",
    "Email",
    "Date",
    "DateTime",
    "Color",
    "RichText",
    "Textarea",
    "Image",
    "URL",
    "File",
    "ScrollLink",
    "NestedDocument",
    "ReferenceDocument",
)

VALID_RELATIONS = ("OneToOne", "OneToMany")

# Field types with conditional fields
NO_DEFAULT_VALUE_TYPES = {
    "ReferenceDocument",
    "NestedDocument",
    "RichText",
    "Textarea",
    "Image",
    "File",
    "URL",
}
NO_PLACEHOLDER_TYPES = {
    "Email",
    "Image",
    "File",
    "Color",
    "Boolean",
    "NestedDocument",
    "ReferenceDocument",
    "RichText",
}
NESTED_SCHEMA_TYPES = {"NestedDocument"}
REFERENCE_SCHEMA_TYPES = {"ReferenceDocument"}
RICH_TEXT_WRAPPER_TYPES = {"RichText"}
RELATION_TYPES = {"ReferenceDocument", "NestedDocument"}

SCHEMA_NAME_PATTERN = r"^[A-Z][a-zA-Z]*$"
FIELD_NAME_PATTERN = r"^[a-z]+(_[a-z]+)*$"


class SchemaFieldCreate(BaseModel):
    """Pydantic model for creating a schema field - mirrors backend SchemaFieldIn.

    Conditional fields are optional (None = not provided). Validation only runs
    when a non-None value is given. to_storage() converts None -> "" for backend.
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    name: str = Field(alias="_name", pattern=FIELD_NAME_PATTERN)
    type: Literal[ALL_FIELD_TYPES] = Field(default="String", alias="_type")
    description: str = Field(default="", alias="_description")
    relation: Literal[VALID_RELATIONS] | None = Field(default=None, alias="_relation")
    default_value: str | None = Field(default=None, alias="_default_value")
    placeholder: str | None = Field(default=None, alias="_placeholder")
    nested_schema: str | None = Field(default=None, alias="_nested_schema")
    reference_schema: list[str] | None = Field(default=None, alias="_reference_schema")
    rich_text_wrapper: str | None = Field(default=None, alias="_rich_text_wrapper")
    display_name: bool = Field(default=False, alias="_display_name")
    required: bool = Field(default=False, alias="_required")
    schema_name: str = Field(alias="_schema_name", pattern=SCHEMA_NAME_PATTERN)

    @field_validator("schema_name", mode="before")
    @classmethod
    def validate_schema_name(cls, v: str) -> str:
        if not re.match(SCHEMA_NAME_PATTERN, v):
            raise ValueError("Must be PascalCase without numbers (e.g. 'BlogPost')")
        return v

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not re.match(FIELD_NAME_PATTERN, v):
            raise ValueError("Must be snake_case without numbers (e.g. 'post_title')")
        return v

    @field_validator("relation")
    @classmethod
    def validate_relation(cls, v: str | None, info) -> str | None:
        if v is None:
            return v
        field_type = info.data.get("type") or info.data.get("_type")
        if field_type not in RELATION_TYPES:
            raise ValueError(
                f"relation only valid for ReferenceDocument or NestedDocument, not {field_type}"
            )
        return v

    @field_validator("default_value")
    @classmethod
    def validate_default_value(cls, v: str | None, info) -> str | None:
        if v is None:
            return v
        field_type = info.data.get("type") or info.data.get("_type")
        if v and field_type in NO_DEFAULT_VALUE_TYPES:
            raise ValueError(f"default_value not supported for {field_type}")
        return v

    @field_validator("placeholder")
    @classmethod
    def validate_placeholder(cls, v: str | None, info) -> str | None:
        if v is None:
            return v
        field_type = info.data.get("type") or info.data.get("_type")
        if v and field_type in NO_PLACEHOLDER_TYPES:
            raise ValueError(f"placeholder not supported for {field_type}")
        return v

    @field_validator("nested_schema")
    @classmethod
    def validate_nested_schema(cls, v: str | None, info) -> str | None:
        if v is None:
            return v
        field_type = info.data.get("type") or info.data.get("_type")
        if field_type in NESTED_SCHEMA_TYPES:
            if not v:
                raise ValueError("nested_schema required for NestedDocument")
            if not re.match(SCHEMA_NAME_PATTERN, v):
                raise ValueError("nested_schema must be PascalCase (e.g. 'Author')")
        elif v:
            raise ValueError(f"nested_schema only valid for NestedDocument, not {field_type}")
        return v

    @field_validator("reference_schema")
    @classmethod
    def validate_reference_schema(cls, v: list[str] | None, info) -> list[str] | None:
        if v is None:
            return v
        field_type = info.data.get("type") or info.data.get("_type")
        if field_type in REFERENCE_SCHEMA_TYPES:
            if not v or not any(v):
                raise ValueError(
                    "reference_schema required for ReferenceDocument (list of collection names)"
                )
        elif v and any(v):
            raise ValueError(f"reference_schema only valid for ReferenceDocument, not {field_type}")
        return v

    @field_validator("rich_text_wrapper")
    @classmethod
    def validate_rich_text_wrapper(cls, v: str | None, info) -> str | None:
        if v is None:
            return v
        field_type = info.data.get("type") or info.data.get("_type")
        if v and field_type not in RICH_TEXT_WRAPPER_TYPES:
            raise ValueError(f"rich_text_wrapper only valid for RichText, not {field_type}")
        return v

    @model_validator(mode="after")
    def validate_required_conditional_fields(self) -> "SchemaFieldCreate":
        """Check that required conditional fields are provided for specific types."""
        field_type = self.type
        if field_type in NESTED_SCHEMA_TYPES and not self.nested_schema:
            raise ValueError("nested_schema required for NestedDocument")
        if field_type in REFERENCE_SCHEMA_TYPES and not self.reference_schema:
            raise ValueError(
                "reference_schema required for ReferenceDocument (list of collection names)"
            )
        return self

    def to_storage(self) -> dict:
        """Convert to backend storage format (aliases, None -> "")."""
        data = self.model_dump(by_alias=True, exclude_none=False)
        # Convert None to "" for backend compatibility. _relation is excluded:
        # unlike the others, the backend's _relation is a strict
        # Literal["OneToOne", "OneToMany"] with no "" case — it must always
        # be one of those two literal strings on the wire, so an unset
        # relation gets the same explicit "OneToOne" default the backend
        # itself would apply, never "" and never omitted.
        for key in ("_default_value", "_placeholder", "_nested_schema", "_rich_text_wrapper"):
            if data.get(key) is None:
                data[key] = ""
        if data.get("_relation") is None:
            data["_relation"] = "OneToOne"
        if data.get("_reference_schema") is None:
            data["_reference_schema"] = []
        return data


# Index-uniqueness and display-name-uniqueness are enforced atomically by the
# backend (cms_backend/routers/sdk_schema.py, via
# api.utils.schema.check_index_and_display_name_conflicts) — no client-side
# pre-check here, since a read-then-write check over HTTP can't be atomic and
# would just add a redundant round trip.

# ── Guardrails ──────────────────────────────────────────────────────────────────

RATE_LIMIT_RPM = int(os.environ.get("MCP_RATE_LIMIT", "60"))
MAX_BODY_SIZE = int(os.environ.get("MCP_MAX_BODY_SIZE", "1048576"))  # 1MB
READ_ONLY = os.environ.get("MCP_READ_ONLY", "false").lower() == "true"

# Token bucket rate limiter (per-process, in-memory)
_rate_buckets: dict[str, dict[str, float]] = defaultdict(
    lambda: {"tokens": float(RATE_LIMIT_RPM), "last_refill": time.time()}
)


def _check_rate_limit(key: str) -> None:
    """Token bucket rate limiter."""
    now = time.time()
    bucket = _rate_buckets[key]
    elapsed_minutes = (now - bucket["last_refill"]) / 60
    bucket["tokens"] = min(RATE_LIMIT_RPM, bucket["tokens"] + elapsed_minutes * RATE_LIMIT_RPM)
    if bucket["tokens"] < 1:
        raise ValueError(f"Rate limit exceeded: {RATE_LIMIT_RPM} requests/minute")
    bucket["tokens"] -= 1
    bucket["last_refill"] = now


def _sanitize_input(obj: Any, path: str = "") -> Any:
    """Sanitize input: trim strings, limit size, reject suspicious patterns."""
    if obj is None:
        return obj
    if isinstance(obj, str):
        trimmed = obj.strip()
        if len(trimmed) > 10000:
            raise ValueError(f"{path}: string too long (max 10000 chars)")
        if (
            "<" in trimmed
            and ">" in trimmed
            and ("script" in trimmed.lower() or "onerror" in trimmed.lower())
        ):
            raise ValueError(f"{path}: suspicious content rejected")
        return trimmed
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, (int, float)):
        if math.isnan(obj) or obj == float("inf") or obj == float("-inf"):
            raise ValueError(f"{path}: invalid number")
        return obj
    if isinstance(obj, list):
        if len(obj) > 1000:
            raise ValueError(f"{path}: array too large (max 1000)")
        return [_sanitize_input(v, f"{path}[{i}]") for i, v in enumerate(obj)]
    if isinstance(obj, dict):
        if len(obj) > 100:
            raise ValueError(f"{path}: object too many keys (max 100)")
        return {k: _sanitize_input(v, f"{path}.{k}") for k, v in obj.items() if len(k) <= 100}
    raise ValueError(f"{path}: unsupported type {type(obj).__name__}")


def _validate_body_size(body: Any) -> None:
    """Validate request body size."""
    size = len(json.dumps(body, default=str).encode("utf-8"))
    if size > MAX_BODY_SIZE:
        raise ValueError(f"Request body too large: {size} bytes (max {MAX_BODY_SIZE})")


def _is_write_tool(name: str) -> bool:
    """Check if tool is a write operation."""
    return name.startswith(
        ("create", "update", "delete", "set", "rtdb_set", "rtdb_update", "rtdb_delete")
    )


def with_guardrails(tool_name: str):
    """Decorator to apply guardrails to tool handlers."""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            client_key = f"{tool_name}:{CMS_API_KEY[:8]}"
            _check_rate_limit(client_key)
            # Validate and sanitize kwargs (the tool arguments)
            _validate_body_size(kwargs)
            sanitized = _sanitize_input(kwargs)
            if READ_ONLY and _is_write_tool(tool_name):
                raise ValueError("Write operations disabled (MCP_READ_ONLY=true)")
            return await func(*args, **sanitized)

        return wrapper

    return decorator


def _resolve_project_id(explicit: str | None) -> str:
    """Resolve project_id: explicit arg > env var > raise. Treats empty/whitespace string as not provided."""
    pid = (explicit.strip() if explicit else None) or CMS_PROJECT_ID
    if not pid:
        raise ValueError(
            "project_id is required (provide as argument or set CMS_PROJECT_ID env var)"
        )
    return pid


mcp = FastMCP("DashTro CMS")


# ── HTTP helpers ──────────────────────────────────────────────────────────────


def _headers() -> dict:
    """JSON content-type header, plus X-API-Key if CMS_API_KEY is set."""
    h = {"Content-Type": "application/json"}
    if CMS_API_KEY:
        h["X-API-Key"] = CMS_API_KEY
    return h


def _url(path: str) -> str:
    """Join CMS_API_URL and path into a full request URL."""
    return f"{CMS_API_URL.rstrip('/')}{path}"


def _check_circuit_breaker() -> None:
    """Check if circuit breaker allows request execution."""
    if not _circuit_breaker.can_execute():
        raise CircuitBreakerOpen(_circuit_breaker.get_retry_after())


def _enrich_http_error(e: httpx.HTTPStatusError) -> httpx.HTTPStatusError:
    """Re-raise with the backend's actual error detail in the message.

    raise_for_status()'s default message only has the status code and URL —
    a schema-field validation failure's actual reason (e.g. "Index 1 already
    used by field 'title' in schema 'Post'") would otherwise never reach the
    MCP tool caller. Keeps the exception type/response intact so existing
    status-code checks still work.
    """
    try:
        body = e.response.json()
        detail = body.get("detail", body) if isinstance(body, dict) else body
    except ValueError:
        detail = e.response.text
    message = f"{e} — {detail}" if detail else str(e)
    return httpx.HTTPStatusError(message, request=e.request, response=e.response)


async def _execute_with_retry(
    method: str,
    path: str,
    data: dict | None = None,
    params: dict | None = None,
) -> dict | list | None:
    """Execute HTTP request with retry logic and circuit breaker."""
    _check_circuit_breaker()

    async def _do_request() -> dict | list | None:
        async with httpx.AsyncClient(timeout=30) as client:
            if method == "GET":
                r = await client.get(_url(path), headers=_headers(), params=params)
            elif method == "POST":
                r = await client.post(_url(path), headers=_headers(), json=data or {})
            elif method == "PUT":
                r = await client.put(_url(path), headers=_headers(), json=data)
            elif method == "PATCH":
                r = await client.patch(_url(path), headers=_headers(), json=data)
            elif method == "DELETE":
                r = await client.delete(_url(path), headers=_headers())
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            if r.status_code in RETRYABLE_STATUS_CODES:
                # Raise to trigger retry
                r.raise_for_status()

            r.raise_for_status()
            if method == "DELETE":
                return None
            return r.json()

    try:
        result = await _retry_async(_do_request)
        _circuit_breaker.record_success()
        return result
    except httpx.HTTPStatusError as e:
        _circuit_breaker.record_failure()
        raise _enrich_http_error(e) from e
    except (httpx.TimeoutException, httpx.NetworkError, httpx.ConnectError):
        _circuit_breaker.record_failure()
        raise


async def _get(path: str, params: dict | None = None) -> dict | list:
    """GET path and return the parsed JSON body, raising on a non-2xx response."""
    return await _execute_with_retry("GET", path, params=params)  # type: ignore[return-value]


async def _post(path: str, data: dict | None = None) -> dict:
    """POST data as JSON to path and return the parsed JSON body, raising on a non-2xx response."""
    return await _execute_with_retry("POST", path, data=data)  # type: ignore[return-value]


async def _put(path: str, data: dict) -> dict:
    """PUT data as JSON to path and return the parsed JSON body, raising on a non-2xx response."""
    return await _execute_with_retry("PUT", path, data=data)  # type: ignore[return-value]


async def _patch(path: str, data: dict) -> dict:
    """PATCH data as JSON to path and return the parsed JSON body, raising on a non-2xx response."""
    return await _execute_with_retry("PATCH", path, data=data)  # type: ignore[return-value]


async def _delete(path: str) -> None:
    """DELETE path, raising on a non-2xx response."""
    await _execute_with_retry("DELETE", path)


def _dump(obj) -> str:
    """Serialize obj to compact JSON for a tool's text response."""
    return json.dumps(obj, default=str, separators=(",", ":"))


# ── Projects ──────────────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("create_project")
async def create_project(name: str, description: str = "") -> str:
    """
    Create a new project, complete with its "production" workspace.
    Only works with an unscoped API key (one not already bound to a single
    project) — a key locked to one project can't create another.
    """
    return _dump(await _post("/projects/", data={"name": name, "description": description}))


@mcp.tool()
@with_guardrails("update_project")
async def update_project(
    project_id: str | None = None, name: str = "", description: str = ""
) -> str:
    """Rename a project or change its description."""
    if not name:
        raise ValueError("name is required and cannot be empty")
    pid = _resolve_project_id(project_id)
    return _dump(await _put(f"/projects/{pid}/", data={"name": name, "description": description}))


@mcp.tool()
@with_guardrails("delete_project")
async def delete_project(project_id: str | None = None) -> str:
    """
    Permanently delete a project, including every workspace, schema field,
    collection, and document in it. Irreversible.
    """
    pid = _resolve_project_id(project_id)
    await _delete(f"/projects/{pid}/")
    return _dump({"deleted": pid})


# ── Workspaces ────────────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("create_workspace")
async def create_workspace(project_id: str | None = None, workspace_name: str = "") -> str:
    """
    Create a non-production workspace to write draft content into.
    A project's auto-created "production" workspace is read-only for direct
    document writes, so a workspace created here is where create_document
    and update_document actually need to target.
    """
    if not workspace_name:
        raise ValueError("workspace_name is required and cannot be empty")
    pid = _resolve_project_id(project_id)
    return _dump(
        await _post(f"/projects/{pid}/workspaces/", data={"workspace_name": workspace_name})
    )


# ── Schema ────────────────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("list_schema")
async def list_schema(project_id: str | None = None) -> str:
    """List all schema names defined in a project."""
    pid = _resolve_project_id(project_id)
    data = await _get(f"/projects/{pid}/schema/")
    return _dump({"schema_names": data.get("_schema_names", [])})


@mcp.tool()
@with_guardrails("get_schema")
async def get_schema(project_id: str | None = None, schema_name: str = "") -> str:
    """Get the field definitions for a named schema, including field types and defaults."""
    if not schema_name:
        raise ValueError("schema_name is required and cannot be empty")
    pid = _resolve_project_id(project_id)
    return _dump(await _get(f"/projects/{pid}/schema/{schema_name}/"))


@mcp.tool()
@with_guardrails("create_schema_field")
async def create_schema_field(
    project_id: str | None = None,
    schema_name: str = "",
    field_name: str = "",
    field_type: str = "String",
    display_name: bool = False,
    description: str = "",
    relation: str | None = None,
    default_value: str | None = None,
    placeholder: str | None = None,
    nested_schema: str | None = None,
    reference_schema: list[str] | None = None,
    rich_text_wrapper: str | None = None,
    required: bool = False,
) -> str:
    """
    Add a field to a schema (creating the schema itself the first time a
    field references it).

    field_type must be one of: String, Number, Boolean, Email, Date, DateTime,
    Color, RichText, Textarea, Image, URL, File, ScrollLink, NestedDocument,
    ReferenceDocument

    Conditional fields:
    - relation (OneToOne/OneToMany): only for ReferenceDocument, NestedDocument
    - default_value: not for ReferenceDocument, NestedDocument, RichText, Textarea, Image, File, URL
    - placeholder: not for Email, Image, File, Color, Boolean, NestedDocument, ReferenceDocument, RichText
    - nested_schema (PascalCase): required for NestedDocument
    - reference_schema (list of collection names): required for ReferenceDocument
    - rich_text_wrapper: only for RichText
    - display_name: only one per schema (enforced)
    - required: boolean

    Field order (_index) is assigned automatically by the backend — new
    fields are always appended to the end of the schema; there's no way to
    request a specific position here.
    """
    pid = _resolve_project_id(project_id)

    # Build data for Pydantic validation - only include non-None optional fields
    field_data = {
        "_name": field_name,
        "_type": field_type,
        "_schema_name": schema_name,
        "_display_name": display_name,
        "_description": description,
        "_required": required,
    }
    # Add optional fields only if provided (not None)
    if relation is not None:
        field_data["_relation"] = relation
    if default_value is not None:
        field_data["_default_value"] = default_value
    if placeholder is not None:
        field_data["_placeholder"] = placeholder
    if nested_schema is not None:
        field_data["_nested_schema"] = nested_schema
    if reference_schema is not None:
        field_data["_reference_schema"] = reference_schema
    if rich_text_wrapper is not None:
        field_data["_rich_text_wrapper"] = rich_text_wrapper

    # Validate with Pydantic (catches type errors, pattern mismatches, conditional field rules)
    try:
        validated = SchemaFieldCreate.model_validate(field_data)
    except Exception as e:
        raise ValueError(f"Invalid schema field: {e}") from e

    # Index/display_name uniqueness is enforced by the backend, atomically.
    # Send to backend
    return _dump(await _post(f"/projects/{pid}/schema/", data=validated.to_storage()))


@mcp.tool()
@with_guardrails("delete_schema_field")
async def delete_schema_field(project_id: str | None = None, field_id: str = "") -> str:
    """Delete a schema field by its id (from create_schema_field's response or get_schema)."""
    pid = _resolve_project_id(project_id)
    await _delete(f"/projects/{pid}/schema/{field_id}/")
    return _dump({"deleted": field_id})


# ── Collections ───────────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("list_collections")
async def list_collections(project_id: str | None = None, minimal: bool = True) -> str:
    """List collections in a project. minimal=True (default) returns only names and schema."""
    pid = _resolve_project_id(project_id)
    data = await _get(f"/projects/{pid}/collections/")
    cols = data.get("_schema_collections", [])
    if minimal:
        return _dump(
            [{"name": c.get("_collection_name"), "schema": c.get("_schema_name")} for c in cols]
        )
    return _dump(cols)


@mcp.tool()
@with_guardrails("create_collection")
async def create_collection(
    project_id: str | None = None, collection_name: str = "", schema_name: str = ""
) -> str:
    """
    Create a collection backed by an existing schema (create its fields
    with create_schema_field first). Documents are then written into this
    collection via create_document.
    """
    if not collection_name:
        raise ValueError("collection_name is required and cannot be empty")
    if not schema_name:
        raise ValueError("schema_name is required and cannot be empty")
    pid = _resolve_project_id(project_id)
    return _dump(
        await _post(
            f"/projects/{pid}/collections/",
            data={"_index": 1, "_collection_name": collection_name, "_schema_name": schema_name},
        )
    )


@mcp.tool()
@with_guardrails("delete_collection")
async def delete_collection(project_id: str | None = None, collection_id: str = "") -> str:
    """
    Permanently delete a collection and its documents across every
    workspace. Irreversible.
    """
    pid = _resolve_project_id(project_id)
    await _delete(f"/projects/{pid}/collections/{collection_id}/")
    return _dump({"deleted": collection_id})


# ── Documents ─────────────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("list_documents")
async def list_documents(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    minimal: bool = True,
) -> str:
    """
    List documents in a collection. minimal=True (default) returns only IDs and labels.
    """
    pid = _resolve_project_id(project_id)
    data = await _get(f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/")
    if minimal:
        return _dump(
            {
                "document_ids": data.get("_document_ids", []),
                "document_labels": data.get("_document_labels", {}),
            }
        )
    return _dump(
        {
            "schema_name": data.get("_schema_name"),
            "document_ids": data.get("_document_ids", []),
            "document_labels": data.get("_document_labels", {}),
            "document_statuses": data.get("_document_statuses", {}),
        }
    )


@mcp.tool()
@with_guardrails("get_document")
async def get_document(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    document_id: str = "",
    minimal: bool = True,
    depth: int = 3,
) -> str:
    """
    Fetch a document. minimal=True (default) skips reference inlining (depth=0).
    """
    pid = _resolve_project_id(project_id)
    return _dump(
        await _get(
            f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/",
            params={"depth": 0 if minimal else depth},
        )
    )


@mcp.tool()
@with_guardrails("create_document")
async def create_document(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    data: dict | None = None,
) -> str:
    """
    Create a new document in a collection.

    data is validated against the collection's schema: every key must be a
    real field name on that schema (no invented fields), and each value must
    match its field's declared type (including OneToMany list shapes and
    NestedDocument/compound object shapes). Missing a field marked required
    is rejected. data may include _id (honored if given, else
    server-generated); no other underscore-prefixed key is allowed —
    including _status, which always starts as 'draft' and can't be set here.
    Production workspace is read-only.
    """
    pid = _resolve_project_id(project_id)
    return _dump(
        await _post(
            f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/",
            data=data or {},
        )
    )


@mcp.tool()
@with_guardrails("update_document")
async def update_document(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    document_id: str = "",
    data: dict | None = None,
) -> str:
    """
    Update fields on an existing document. Only include keys you want to change.
    The merged result (existing fields plus this update) is validated against
    the collection's schema the same way create_document is — an update
    cannot introduce an invented field, a wrong-typed value, or leave a
    required field empty. data cannot contain _id or any underscore-prefixed
    key at all, including _status — status is never settable through this
    tool. If the document was published, editing it here reverts it to
    'draft' automatically (it no longer matches what was pushed to
    production) — see update_document_status to explicitly revert to draft;
    'published' can only be set by pushing to production, which isn't
    available through MCP. The previous state is automatically saved as a
    version before the update is applied. Production workspace is read-only.
    """
    pid = _resolve_project_id(project_id)
    return _dump(
        await _put(
            f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/",
            data=data or {},
        )
    )


@mcp.tool()
@with_guardrails("update_document_status")
async def update_document_status(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    document_id: str = "",
    status: str = "",
) -> str:
    """
    Revert a document to 'draft'. status must be 'draft' — 'published' can't
    be set through this tool or anywhere else in MCP; it's only ever set as
    a side effect of pushing to production through the CMS UI, which MCP
    doesn't have access to. Production workspace is read-only.
    """
    if status != "draft":
        raise ValueError(
            "status must be 'draft' — 'published' is set by pushing to production, "
            "which isn't available through MCP"
        )
    pid = _resolve_project_id(project_id)
    return _dump(
        await _patch(
            f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/status/",
            data={"_status": status},
        )
    )


@mcp.tool()
@with_guardrails("delete_document")
async def delete_document(
    project_id: str | None = None,
    workspace_name: str = "",
    collection_name: str = "",
    document_id: str = "",
) -> str:
    """
    Permanently delete a document from a collection.
    Production workspace is read-only.
    """
    pid = _resolve_project_id(project_id)
    await _delete(
        f"/projects/{pid}/workspace/{workspace_name}/collection/{collection_name}/document/{document_id}/"
    )
    return _dump({"deleted": document_id})


# ── Realtime Database ─────────────────────────────────────────────────────────


@mcp.tool()
@with_guardrails("rtdb_get")
async def rtdb_get(project_id: str | None = None, path: str = "") -> str:
    """
    Read a node (or the whole tree if path is empty) from a project's Realtime Database.
    path is a '/'-delimited key path, e.g. 'settings/homepage'.
    """
    pid = _resolve_project_id(project_id)
    return _dump(await _get(f"/projects/{pid}/rtdb/{path}"))


@mcp.tool()
@with_guardrails("rtdb_set")
async def rtdb_set(project_id: str | None = None, path: str = "", value: Any = None) -> str:
    """
    Overwrite the node at path with value (any JSON-serializable data).
    An empty path targets the tree root.
    """
    pid = _resolve_project_id(project_id)
    return _dump(await _put(f"/projects/{pid}/rtdb/{path}", data=value))


@mcp.tool()
@with_guardrails("rtdb_update")
async def rtdb_update(
    project_id: str | None = None, path: str = "", value: dict | None = None
) -> str:
    """Shallow-merge value (a JSON object) into the existing node at path."""
    pid = _resolve_project_id(project_id)
    return _dump(await _patch(f"/projects/{pid}/rtdb/{path}", data=value or {}))


@mcp.tool()
@with_guardrails("rtdb_delete")
async def rtdb_delete(project_id: str | None = None, path: str = "") -> str:
    """Delete the node at path (or the entire tree if path is empty). Irreversible."""
    pid = _resolve_project_id(project_id)
    await _delete(f"/projects/{pid}/rtdb/{path}")
    return _dump({"deleted": path or "/"})


# ── Resources (readable by any MCP client) ──────────────────────────────────


USAGE_INSTRUCTIONS = """# DashTro CMS MCP — Usage Guide

## Quick Start
1. Set `CMS_API_URL` (e.g., `https://admin.example.com/api/sdk`)
2. Set `CMS_API_KEY` (scoped per-collection from CMS Settings → API Keys)
3. Optional: Set `CMS_PROJECT_ID` to avoid passing `project_id` on every call

## Token Optimization (Critical for Free Models)
- **Default: `minimal=true`** on `list_collections`, `list_documents`, `get_document` — returns only essential fields (~50-70% token savings)
- Use `minimal=false` only when you need full metadata (schema names, statuses, etc.)
- **Compact JSON** — all responses use no pretty-print indentation (~30-50% savings)

## Project/Workspace Hierarchy
```
Project (production workspace is read-only)
├── Workspace (e.g., "staging", "draft")  ← write here
│   └── Collection (backed by a Schema)
│       └── Document (draft → published)
```

**Key rule**: The auto-created "production" workspace is **read-only** for direct document writes. Always create a workspace first (`create_workspace`), then write documents there.

## Common Workflows

### Create Content
1. `create_workspace` → creates "staging" workspace
2. `list_schema` → find/create schema (`create_schema_field`)
3. `create_collection` → bind collection to schema
4. `create_document` → write content in staging workspace (starts as `draft`)
5. Publishing (`draft` → `published`) happens by pushing to production through the CMS UI — MCP has no access to that action. `update_document_status` can only revert a document back to `draft`.

### Read Content Efficiently
- `list_collections {minimal: true}` → just names & schemas
- `list_documents {minimal: true}` → just IDs & labels
- `get_document {minimal: true, depth: 0}` → single document, no reference expansion

## Guardrails (Auto-Enforced)
| Protection | Config | Default |
|------------|--------|---------|
| Rate limit | `MCP_RATE_LIMIT` | 60 RPM |
| Input sanitization | 10k chars, XSS detection | Always on |
| Body size | `MCP_MAX_BODY_SIZE` | 1 MB |
| Read-only mode | `MCP_READ_ONLY=true` | Off |

## Tool Categories
**Write** (blocked in read-only mode): `create_*`, `update_*`, `delete_*`, `set_*`
**Read**: `list_*`, `get_*`, `rtdb_get`

## Schema Field Types
- `String`, `Number`, `Boolean`, `Email`, `Date`, `DateTime`, `Color`, `RichText`, `Textarea`, `Image`, `URL`, `File`, `ScrollLink`, `NestedDocument`
- `ReferenceDocument` (links to another collection's document)
- Set `display_name: true` on one field to use as document label

## Realtime Database
- `rtdb_get/set/update/delete` for key/value storage per project
- Path format: `settings/homepage`, `features/flags`
- Use for config, feature flags, small JSON blobs

## Troubleshooting
- **401/403**: Check `CMS_API_KEY` scope (collection read/write)
- **project_id required**: Set `CMS_PROJECT_ID` env or pass explicitly
- **Rate limited**: Wait or increase `MCP_RATE_LIMIT`
- **Empty results**: Verify workspace name (production is read-only)"""


@mcp.resource("dashtro://usage", mime_type="text/markdown")
async def usage_instructions() -> str:
    """Complete usage guide with token optimization, workflows, and best practices."""
    return USAGE_INSTRUCTIONS


# ── Prompts (reusable prompt templates) ───────────────────────────────────


@mcp.prompt(
    name="create-content-workflow",
    description="Step-by-step guide to create a new content type and publish documents",
)
async def create_content_workflow() -> str:
    return """Follow this workflow to create and publish content:

1. **Create a workspace** (production is read-only):
   `create_workspace {project_id, workspace_name: "staging"}`

2. **Define schema** (if not exists):
   `list_schema {project_id}` → check existing
   `create_schema_field {project_id, schema_name: "Post", field_name: "title", field_type: "String", display_name: true}`
   `create_schema_field {project_id, schema_name: "Post", field_name: "body", field_type: "RichText"}`
   `create_schema_field {project_id, schema_name: "Post", field_name: "author", field_type: "ReferenceDocument"}`
   (order is append-only and server-assigned — fields are created in the order you want them to appear)

3. **Create collection** bound to schema:
   `create_collection {project_id, collection_name: "posts", schema_name: "Post"}`

4. **Write documents** in staging (starts as `draft`):
   `create_document {project_id, workspace_name: "staging", collection_name: "posts", data: {title: "Hello", body: "..."}}`

5. **Publish**: this happens by pushing the collection or document to production through the CMS UI — MCP doesn't have access to that action. `update_document_status` only reverts a document back to `draft`; it can't set `published`.

**Tip**: Use `minimal: true` (default) on all list/get calls to save tokens."""


@mcp.prompt(
    name="read-content-workflow",
    description="Efficiently browse and fetch content with minimal tokens",
)
async def read_content_workflow() -> str:
    return """Read content efficiently:

1. **List collections** (minimal):
   `list_collections {project_id, minimal: true}`
   → Returns: [{name, schema}]

2. **List documents** in a collection (minimal):
   `list_documents {project_id, workspace_name: "staging", collection_name: "posts", minimal: true}`
   → Returns: {document_ids: [...], document_labels: {...}}

3. **Fetch single document** (minimal, no reference expansion):
   `get_document {project_id, workspace_name: "staging", collection_name: "posts", document_id: "xxx", minimal: true, depth: 0}`

4. **Need full data?** Set `minimal: false`:
   `list_collections {minimal: false}` → includes all metadata
   `get_document {minimal: false, depth: 3}` → expands references 3 levels

**Token tip**: Default `minimal=true` saves ~60% tokens. Only disable when you need statuses, schema names, or reference expansion."""


@mcp.prompt(
    name="schema-design-workflow",
    description="Design schemas with proper field types and references",
)
async def schema_design_workflow() -> str:
    return """Schema design best practices:

**Field types:**
- `String` — short text (titles, slugs, tags)
- `Number` — integers, floats (counts, prices)
- `Boolean` — true/false (flags, featured)
- `RichText` — long-form content (body, description)
- `NestedDocument` — embedded sub-object within the same document
- `ReferenceDocument` — link to ONE document in another collection

**Design rules:**
1. Set `display_name: true` on exactly ONE field per schema (used as label in lists)
2. Use `index` to control field order (1 = first)
3. Reference fields store target document IDs, not full objects
4. Reference expansion happens at read time via `get_document {depth: N}`

**Example — Blog with Authors:**
```
Schema: Author
  - name (String, index: 1, display_name: true)
  - bio (RichText, index: 2)

Schema: Post
  - title (String, index: 1, display_name: true)
  - slug (String, index: 2)
  - body (RichText, index: 3)
  - author (ReferenceDocument, index: 4) → points to Author collection
  - published_at (Number, index: 5) → timestamp
```

Then:
`create_collection {schema_name: "Author", collection_name: "authors"}`
`create_collection {schema_name: "Post", collection_name: "posts"}`"""


@mcp.prompt(
    name="troubleshooting-guide",
    description="Common issues and solutions",
)
async def troubleshooting_guide() -> str:
    return """Troubleshooting:

**Authentication Errors (401/403):**
- Verify `CMS_API_KEY` is set and valid
- Key must have read/write scope on the target collection
- Check key isn't expired/revoked in CMS Settings → API Keys

**Project ID Required:**
- Set `CMS_PROJECT_ID` environment variable, OR
- Pass `project_id` explicitly on every tool call

**Rate Limited (429):**
- Default: 60 requests/minute per API key
- Increase `MCP_RATE_LIMIT` env var if needed
- Batch operations where possible

**Empty Results:**
- Production workspace is READ-ONLY for writes
- Use a custom workspace: `create_workspace` then write there
- Verify workspace_name matches exactly (case-sensitive)

**Reference Not Expanding:**
- `get_document` defaults to `depth: 0` (no expansion)
- Use `depth: 3` (or higher) to expand ReferenceDocument fields
- `minimal: true` forces depth=0 — use `minimal: false` with explicit depth

**Large Responses:**
- Use `minimal: true` on list calls
- Filter client-side instead of fetching full data
- Paginate with multiple calls if needed"""


# ── Auto-load Skills from skills/ directory ───────────────────────────────────

import pathlib


def _make_skill_loader(content: str):
    async def _load_skill() -> str:
        return content

    return _load_skill


def _make_skill_prompt(content: str):
    async def _skill_prompt() -> str:
        return content

    return _skill_prompt


_skills_dir = pathlib.Path(__file__).parent / "skills"
if _skills_dir.exists():
    for skill_file in _skills_dir.glob("*.md"):
        skill_content = skill_file.read_text(encoding="utf-8")
        skill_stem = skill_file.stem

        # Register as resource
        mcp.resource(f"dashtro://skills/{skill_stem}", mime_type="text/markdown")(
            _make_skill_loader(skill_content)
        )

        # Register as prompt
        mcp.prompt(
            name=skill_stem,
            description=f"Skill: {skill_stem.replace('-', ' ').title()}",
        )(_make_skill_prompt(skill_content))


if __name__ == "__main__":
    mcp.run()
