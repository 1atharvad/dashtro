"""
Tests for the public /api/stats/ status endpoint: reachable without any
credentials, reports the app version and database health, and serves a cached
snapshot inside its refresh window.
"""

STATS_URL = "/api/stats/"


def test_stats_is_public(client):
    """The stats endpoint answers 200 with no cookie, bearer token or API key."""
    client.cookies.clear()
    resp = client.get(STATS_URL)
    assert resp.status_code == 200, resp.text
    assert resp.headers["cache-control"] == "no-store"


def test_stats_reports_status_version_and_database(client):
    """The snapshot carries status, version, uptime, a healthy database probe and process info."""
    body = client.get(STATS_URL).json()
    assert body["status"] == "ok"
    assert isinstance(body["version"], str) and body["version"]
    assert body["uptime_seconds"] >= 0
    assert body["database"]["ok"] is True
    assert body["database"]["latency_ms"] >= 0
    assert body["process"]["threads"] >= 1


def test_stats_snapshot_is_cached(client):
    """Two requests inside the cache window return the identical snapshot."""
    first = client.get(STATS_URL).json()
    second = client.get(STATS_URL).json()
    assert first["generated_at"] == second["generated_at"]
