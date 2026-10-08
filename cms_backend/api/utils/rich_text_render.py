import hashlib
import json
import logging
import re
import subprocess
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import markdown as md
from models.field_types import ADVI_WRAPPER_COMPONENTS

REACT_RENDER_DIR = Path(__file__).resolve().parents[2] / "react_render"
# Compiled ahead of time (`npm run build` in react_render/, see its
# package.json) — a plain `node` invocation on prebuilt JS, not a per-call
# TS transform, since `resolve_inline_components` spawns one of these per
# inline component tag in a field, not once per document.
RENDER_JS_PATH = REACT_RENDER_DIR / "dist" / "render.js"
_MD_EXTENSIONS = ["extra", "sane_lists"]
_MAX_INLINE_NESTING = 5
# Rendered markup per distinct (component source, content) payload — each miss costs
# a Node process, so repeated tags and repeat reads of unchanged content reuse it.
_RENDER_CACHE_SIZE = 1024
_render_cache: OrderedDict[str, str] = OrderedDict()
_render_cache_lock = threading.Lock()

# A single worker so background bakes queue up instead of stampeding a small instance
# with parallel Node processes; _pending_bakes dedupes identical queued content.
_bake_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="rich-text-bake")
_pending_bakes: set[str] = set()
_pending_bakes_lock = threading.Lock()

logger = logging.getLogger(__name__)

# Matches only an inline component reference's *opening* tag — the matching
# close tag is found separately (see _find_matching_close) by tracking
# nesting depth, since a single non-greedy regex like `<(\w+)>(.*?)</\1>`
# pairs an outer open tag with the FIRST same-named close tag it finds,
# which is wrong the moment a component is nested inside another instance
# of itself, e.g. `<Foo><Foo>x</Foo></Foo>`.
_OPEN_TAG_RE = re.compile(r"<([A-Z][A-Za-z0-9]*)>")


class RichTextComponentNotFoundError(Exception):
    """Raised when a field references a component (inline tag, or a whole-field
    `_rich_text_wrapper`) that isn't a defined custom or built-in component."""

    def __init__(self, name: str):
        self.name = name
        super().__init__(f"RichText component '{name}' is not defined.")


class RichTextRenderError(Exception):
    """Raised when the Node render subprocess itself fails (a JS error in a
    component's source, or the subprocess crashing/timing out)."""


def markdown_to_html(source: str) -> str:
    """Convert a RichText field's stored markdown source to plain HTML."""
    return md.markdown(source or "", extensions=_MD_EXTENSIONS)


def _cache_get(key: str) -> str | None:
    """Return the cached render for `key` (refreshing its recency), or None on a miss."""
    with _render_cache_lock:
        if key not in _render_cache:
            return None
        _render_cache.move_to_end(key)
        return _render_cache[key]


def _cache_put(key: str, value: str) -> None:
    """Store a render, evicting the least recently used entry beyond the size limit."""
    with _render_cache_lock:
        _render_cache[key] = value
        _render_cache.move_to_end(key)
        while len(_render_cache) > _RENDER_CACHE_SIZE:
            _render_cache.popitem(last=False)


def _render_cache_clear() -> None:
    """Empty the render cache (used by tests)."""
    with _render_cache_lock:
        _render_cache.clear()


def _payload_key(payload: dict[str, Any]) -> str:
    """Stable cache key for a render payload (component source + content)."""
    return json.dumps(payload, sort_keys=True)


def _run_node_render(payload: dict[str, Any]) -> str:
    """Render a component payload to static markup through the Node subprocess, reusing a
    cached result when this exact payload was rendered before. Failures are never cached."""
    key = _payload_key(payload)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        result = subprocess.run(
            ["node", str(RENDER_JS_PATH)],
            input=key,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        raise RichTextRenderError(str(e)) from e

    if result.returncode != 0:
        raise RichTextRenderError(result.stderr or "render.js exited non-zero")
    _cache_put(key, result.stdout)
    return result.stdout


def _render_component(
    name: str, content_html: str, custom_components: dict, cached_only: bool = False
) -> str | None:
    """Render one component around `content_html`. Raises RichTextComponentNotFoundError for
    an undefined component either way; with `cached_only`, returns None instead of starting
    a Node process when this payload hasn't been rendered yet."""
    if name in ADVI_WRAPPER_COMPONENTS:
        payload = {"kind": "advi", "name": name, "contentHtml": content_html}
    else:
        component = next((c for c in custom_components.values() if c.get("name") == name), None)
        if not component:
            raise RichTextComponentNotFoundError(name)
        payload = {
            "kind": "custom",
            "source": component.get("source", ""),
            "contentHtml": content_html,
        }
    if cached_only:
        return _cache_get(_payload_key(payload))
    return _run_node_render(payload)


def _find_matching_close(html: str, tag: str, scan_start: int) -> int | None:
    """Find the start index of the `</tag>` that matches the `<tag>` whose
    content begins at scan_start, tracking nesting depth so a tag nested
    inside another instance of itself pairs correctly. Returns None if no
    matching close tag exists (an unclosed/malformed tag)."""
    open_needle = f"<{tag}>"
    close_needle = f"</{tag}>"
    depth = 1
    pos = scan_start
    while depth > 0:
        next_open = html.find(open_needle, pos)
        next_close = html.find(close_needle, pos)
        if next_close == -1:
            return None
        if next_open != -1 and next_open < next_close:
            depth += 1
            pos = next_open + len(open_needle)
        else:
            depth -= 1
            pos = next_close + len(close_needle)
    return pos - len(close_needle)


def resolve_inline_components(
    html: str,
    custom_components: dict,
    _depth: int = 0,
    cached_only: bool = False,
    missing: list | None = None,
) -> str:
    """Replace every inline component tag in `html` with that component's
    rendered static markup, innermost first. Raises RichTextComponentNotFoundError
    for a tag that names no known component — never silently left as-is.

    Walks tags one at a time (rather than a single regex substitution pass)
    so a component nested inside another instance of itself is matched to
    its correct, depth-tracked closing tag instead of the first same-named
    close tag in the string.

    With `cached_only`, a tag whose render isn't cached yet is replaced by its
    (already resolved) inner content instead of waiting on Node, and its name is
    appended to `missing` so the caller can finish the render in the background."""
    if _depth > _MAX_INLINE_NESTING:
        return html

    match = _OPEN_TAG_RE.search(html)
    if not match:
        return html

    name = match.group(1)
    content_start = match.end()
    close_start = _find_matching_close(html, name, content_start)
    if close_start is None:
        # Unclosed tag — leave it (and everything after it, since we can't
        # tell where it would have ended) untouched rather than guessing.
        return html

    before = html[: match.start()]
    inner = html[content_start:close_start]
    after = html[close_start + len(f"</{name}>") :]

    # Nested tags inside this one count toward the depth guard; sibling tags
    # after it don't — they're resolved via the same recursive call, just at
    # the current depth, matching the old regex.sub-per-pass behavior.
    resolved_inner = resolve_inline_components(
        inner, custom_components, _depth + 1, cached_only, missing
    )
    rendered = _render_component(name, resolved_inner, custom_components, cached_only)
    if rendered is None:
        rendered = resolved_inner
        if missing is not None:
            missing.append(name)
    resolved_after = resolve_inline_components(
        after, custom_components, _depth, cached_only, missing
    )
    return before + rendered + resolved_after


def render_rich_text_value(
    value: Any,
    wrapper_key: str | None,
    custom_components: dict,
    cached_only: bool = False,
    missing: list | None = None,
) -> str | None:
    """Bake a RichText field's stored markdown into static HTML for SDK
    consumers: markdown -> HTML, inline component tags resolved to their
    markup, then (if the field has a whole-field `_rich_text_wrapper`
    configured) wrapped in that component's markup too. Returns None for
    empty content, so the caller can leave the field untouched."""
    if isinstance(value, list):
        source = "\n".join(value)
    elif isinstance(value, str):
        source = value
    else:
        return None
    if not source.strip():
        return None

    content_html = markdown_to_html(source)
    content_html = resolve_inline_components(
        content_html, custom_components, cached_only=cached_only, missing=missing
    )

    if not wrapper_key:
        return content_html

    kind, _, name = wrapper_key.partition(":")
    if kind not in ("advi", "custom"):
        return content_html
    rendered = _render_component(name, content_html, custom_components, cached_only)
    if rendered is None:
        if missing is not None:
            missing.append(name)
        return content_html
    return rendered


def _bake_in_background(key: str, jobs: list, custom_components: dict) -> None:
    """Fully render each (value, wrapper_key) job so its markup lands in the render cache.
    Failures are logged and dropped — the next read surfaces them on a normal render."""
    try:
        for value, wrapper_key in jobs:
            render_rich_text_value(value, wrapper_key, custom_components)
    except (RichTextComponentNotFoundError, RichTextRenderError) as e:
        logger.warning("Background RichText bake failed: %s", e)
    finally:
        with _pending_bakes_lock:
            _pending_bakes.discard(key)


def _schedule_bake(jobs: list, custom_components: dict) -> None:
    """Queue a background render of `jobs` unless identical content is already queued."""
    key = hashlib.sha256(json.dumps(jobs, sort_keys=True, default=str).encode()).hexdigest()
    with _pending_bakes_lock:
        if key in _pending_bakes:
            return
        _pending_bakes.add(key)
    _bake_executor.submit(_bake_in_background, key, jobs, custom_components)


def bake_rich_text_fields(
    doc: dict,
    project_id: str,
    schema_fields: list[dict] | None,
    custom_components: dict | None = None,
) -> dict:
    """Replace each RichText field's raw markdown with static, pre-rendered
    HTML for SDK reads — inline component tags (e.g. `<HighlightedText>...`)
    and any whole-field `_rich_text_wrapper` are both resolved to their
    actual markup. Raises RichTextComponentNotFoundError on a reference to an
    undefined component — callers must not swallow it. Render failures surface
    later, when the background bake's result is missing on a subsequent read.

    Pass a pre-fetched `custom_components` to avoid a redundant DB round
    trip (this runs once per nested referenced document too, not just the
    top-level one); None fetches it here on demand.

    Never waits on Node: tags whose render is already cached come back as markup, the
    rest as their inner content, and the missing renders are finished on a background
    worker so the next read is complete. Still synchronous — callers on an asyncio event
    loop should run it via `asyncio.to_thread`."""
    rich_text_fields = [f for f in (schema_fields or []) if f.get("_type") == "RichText"]
    if not rich_text_fields:
        return doc

    if custom_components is None:
        from api.utils import get_data_client

        custom_components = get_data_client().get_rich_text_components(project_id)

    pending_jobs = []
    for field in rich_text_fields:
        name = field.get("_name")
        if name not in doc:
            continue
        wrapper_key = field.get("_rich_text_wrapper")
        missing: list = []
        rendered = render_rich_text_value(
            doc[name], wrapper_key, custom_components, cached_only=True, missing=missing
        )
        if missing:
            pending_jobs.append((doc[name], wrapper_key))
        if rendered is not None:
            doc[name] = rendered
    if pending_jobs:
        _schedule_bake(pending_jobs, custom_components)
    return doc
