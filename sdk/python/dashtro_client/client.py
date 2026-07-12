import time

import httpx


class _Cache:
    def __init__(self, ttl: float):
        self._ttl = ttl
        self._store: dict[str, tuple[float, object]] = {}

    def get(self, key: str):
        entry = self._store.get(key)
        if entry and time.monotonic() - entry[0] < self._ttl:
            return entry[1]
        return None

    def set(self, key: str, value: object):
        self._store[key] = (time.monotonic(), value)

    def invalidate(self, key: str | None = None):
        if key:
            self._store.pop(key, None)
        else:
            self._store.clear()


def _validate_base_url(base_url: str) -> str:
    if not base_url.startswith(("http://", "https://")):
        raise ValueError(
            f"DashtroClient: base_url must start with 'http://' or 'https://', got: {base_url!r}"
        )
    return base_url


class RtdbClient:
    """Realtime Database access — user-updatable dynamic content, separate
    from the read-oriented, cached document endpoints on DashtroClient."""

    def __init__(self, http: httpx.Client, base_url: str, project_id: str):
        self._http = http
        self._base = base_url.rstrip("/") + f"/api/sdk/projects/{project_id}/rtdb"

    def _url(self, path: str = "") -> str:
        return f"{self._base}/{path.lstrip('/')}" if path else f"{self._base}/"

    def get(self, path: str = ""):
        resp = self._http.get(self._url(path))
        resp.raise_for_status()
        return resp.json()

    def set(self, path: str, value) -> None:
        resp = self._http.put(self._url(path), json=value)
        resp.raise_for_status()

    def update(self, path: str, value: dict) -> None:
        resp = self._http.patch(self._url(path), json=value)
        resp.raise_for_status()

    def remove(self, path: str = "") -> None:
        resp = self._http.delete(self._url(path))
        resp.raise_for_status()


class AsyncRtdbClient:
    def __init__(self, http: httpx.AsyncClient, base_url: str, project_id: str):
        self._http = http
        self._base = base_url.rstrip("/") + f"/api/sdk/projects/{project_id}/rtdb"

    def _url(self, path: str = "") -> str:
        return f"{self._base}/{path.lstrip('/')}" if path else f"{self._base}/"

    async def get(self, path: str = ""):
        resp = await self._http.get(self._url(path))
        resp.raise_for_status()
        return resp.json()

    async def set(self, path: str, value) -> None:
        resp = await self._http.put(self._url(path), json=value)
        resp.raise_for_status()

    async def update(self, path: str, value: dict) -> None:
        resp = await self._http.patch(self._url(path), json=value)
        resp.raise_for_status()

    async def remove(self, path: str = "") -> None:
        resp = await self._http.delete(self._url(path))
        resp.raise_for_status()


class DashtroClient:
    def __init__(
        self,
        base_url: str,
        project_id: str,
        api_key: str,
        workspace: str = "production",
        cache_ttl: float = 60,
    ):
        self.project_id = project_id
        self.workspace = workspace
        base_url = _validate_base_url(base_url)
        self._base = base_url.rstrip("/") + f"/api/sdk/projects/{project_id}/workspace/{workspace}"
        self._http = httpx.Client(headers={"X-API-Key": api_key})
        self._cache = _Cache(cache_ttl)
        self.rtdb = RtdbClient(self._http, base_url, project_id)

    def _get(self, url: str) -> dict:
        cached = self._cache.get(url)
        if cached is not None:
            return cached
        resp = self._http.get(url)
        resp.raise_for_status()
        data = resp.json()
        self._cache.set(url, data)
        return data

    def get_collection(self, collection: str) -> dict:
        return self._get(f"{self._base}/collection/{collection}/")

    def get_document(self, collection: str, document_id: str, depth: int = 3) -> dict:
        return self._get(
            f"{self._base}/collection/{collection}/document/{document_id}/?depth={depth}"
        )

    def get_all_documents(self, collection: str, depth: int = 3) -> list[dict]:
        meta = self.get_collection(collection)
        docs = []
        for doc_id in meta.get("_document_ids", []):
            try:
                docs.append(self.get_document(collection, doc_id, depth=depth))
            except httpx.HTTPStatusError:
                pass
        return docs

    def resolve(self, url: str) -> dict:
        return self._get(url)

    def invalidate(self, url: str | None = None):
        """Clear one cached entry by URL, or the entire cache if no URL given."""
        self._cache.invalidate(url)

    def close(self):
        self._http.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


class AsyncDashtroClient:
    def __init__(
        self,
        base_url: str,
        project_id: str,
        api_key: str,
        workspace: str = "production",
        cache_ttl: float = 60,
    ):
        self.project_id = project_id
        self.workspace = workspace
        base_url = _validate_base_url(base_url)
        self._base = base_url.rstrip("/") + f"/api/sdk/projects/{project_id}/workspace/{workspace}"
        self._http = httpx.AsyncClient(headers={"X-API-Key": api_key})
        self._cache = _Cache(cache_ttl)
        self.rtdb = AsyncRtdbClient(self._http, base_url, project_id)

    async def _get(self, url: str) -> dict:
        cached = self._cache.get(url)
        if cached is not None:
            return cached
        resp = await self._http.get(url)
        resp.raise_for_status()
        data = resp.json()
        self._cache.set(url, data)
        return data

    async def get_collection(self, collection: str) -> dict:
        return await self._get(f"{self._base}/collection/{collection}/")

    async def get_document(self, collection: str, document_id: str, depth: int = 3) -> dict:
        return await self._get(
            f"{self._base}/collection/{collection}/document/{document_id}/?depth={depth}"
        )

    async def get_all_documents(self, collection: str, depth: int = 3) -> list[dict]:
        meta = await self.get_collection(collection)
        docs: list[dict] = []
        for doc_id in meta.get("_document_ids", []):
            try:
                docs.append(await self.get_document(collection, doc_id, depth=depth))
            except httpx.HTTPStatusError:
                pass
        return docs

    async def resolve(self, url: str) -> dict:
        return await self._get(url)

    def invalidate(self, url: str | None = None):
        self._cache.invalidate(url)

    async def aclose(self):
        await self._http.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self.aclose()
