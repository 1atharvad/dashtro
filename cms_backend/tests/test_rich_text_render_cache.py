"""
Tests that RichText component renders are memoized and that SDK bakes never wait on
Node: a cold read returns the unstyled inner content at once and a background worker
fills the cache for the next read.
"""

import subprocess

import pytest
from api.utils import rich_text_render as rtr


class _FakeRun:
    """Stand-in for subprocess.run that counts calls and echoes the payload size."""

    def __init__(self, returncode=0):
        self.calls = 0
        self.returncode = returncode

    def __call__(self, *args, **kwargs):
        """Record the call and return a completed-process-like result."""
        self.calls += 1
        return subprocess.CompletedProcess(
            args, self.returncode, stdout=f"<b>{self.calls}</b>", stderr="boom"
        )


@pytest.fixture
def fake_run(monkeypatch):
    """Replace the Node subprocess with a counter and start from an empty cache."""
    rtr._render_cache_clear()
    fake = _FakeRun()
    monkeypatch.setattr(rtr.subprocess, "run", fake)
    yield fake
    rtr._render_cache_clear()


COMPONENTS = {"c1": {"name": "HighlightedText", "source": "export default () => null"}}


def test_identical_tags_render_once(fake_run):
    """Many identical tags in one field cost a single subprocess call."""
    html = "<p>" + "<HighlightedText>hi</HighlightedText> " * 10 + "</p>"
    rtr.resolve_inline_components(html, COMPONENTS)
    assert fake_run.calls == 1


def test_repeat_render_of_same_content_hits_cache(fake_run):
    """A second read of unchanged content reuses the first render."""
    rtr.resolve_inline_components("<HighlightedText>a</HighlightedText>", COMPONENTS)
    rtr.resolve_inline_components("<HighlightedText>a</HighlightedText>", COMPONENTS)
    assert fake_run.calls == 1


def test_different_content_renders_separately(fake_run):
    """Distinct inner content is a distinct payload and re-renders."""
    rtr.resolve_inline_components("<HighlightedText>a</HighlightedText>", COMPONENTS)
    rtr.resolve_inline_components("<HighlightedText>b</HighlightedText>", COMPONENTS)
    assert fake_run.calls == 2


def test_edited_component_source_invalidates_cache(fake_run):
    """Changing a component's source changes the payload, so it re-renders."""
    rtr.resolve_inline_components("<HighlightedText>a</HighlightedText>", COMPONENTS)
    edited = {"c1": {"name": "HighlightedText", "source": "export default () => 1"}}
    rtr.resolve_inline_components("<HighlightedText>a</HighlightedText>", edited)
    assert fake_run.calls == 2


def test_failed_render_is_not_cached(monkeypatch):
    """A failing render raises every time instead of caching the failure."""
    rtr._render_cache_clear()
    fake = _FakeRun(returncode=1)
    monkeypatch.setattr(rtr.subprocess, "run", fake)
    for _ in range(2):
        with pytest.raises(rtr.RichTextRenderError):
            rtr.resolve_inline_components("<HighlightedText>a</HighlightedText>", COMPONENTS)
    assert fake.calls == 2
    rtr._render_cache_clear()


SCHEMA = [{"_name": "body", "_type": "RichText"}]
TAGGED = "<HighlightedText>hi</HighlightedText>"


def _flush_bakes():
    """Block until the single background bake worker has drained its queue."""
    rtr._bake_executor.submit(lambda: None).result()


def test_cold_bake_returns_inner_content_without_rendering(fake_run):
    """With nothing cached, the bake returns the tag's inner text and spawns no Node process."""
    doc = rtr.bake_rich_text_fields({"body": TAGGED}, "p", SCHEMA, COMPONENTS)
    _flush_bakes()
    assert "<HighlightedText>" not in doc["body"]
    assert "hi" in doc["body"]
    assert "<b>" not in doc["body"]


def test_background_bake_fills_cache_for_next_read(fake_run):
    """After the background worker runs, the next bake returns the rendered markup."""
    rtr.bake_rich_text_fields({"body": TAGGED}, "p", SCHEMA, COMPONENTS)
    _flush_bakes()
    assert fake_run.calls == 1

    second = rtr.bake_rich_text_fields({"body": TAGGED}, "p", SCHEMA, COMPONENTS)
    assert "<b>1</b>" in second["body"]
    assert fake_run.calls == 1


def test_undefined_component_still_raises_synchronously(fake_run):
    """A reference to an undefined component fails fast instead of being deferred."""
    with pytest.raises(rtr.RichTextComponentNotFoundError):
        rtr.bake_rich_text_fields({"body": "<Nope>x</Nope>"}, "p", SCHEMA, COMPONENTS)


def test_background_failure_is_dropped_and_retried_on_next_read(monkeypatch):
    """A failing background render doesn't crash anything and isn't cached."""
    rtr._render_cache_clear()
    fake = _FakeRun(returncode=1)
    monkeypatch.setattr(rtr.subprocess, "run", fake)
    for _ in range(2):
        doc = rtr.bake_rich_text_fields({"body": TAGGED}, "p", SCHEMA, COMPONENTS)
        _flush_bakes()
        assert "hi" in doc["body"]
    assert fake.calls == 2
    rtr._render_cache_clear()
