from pathlib import Path

from api.middleware.auth_middleware import CMSAuthMiddleware
from config import CORS_ORIGINS
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from routers import (
    audit,
    auth,
    collections,
    documents,
    field_types,
    media,
    projects,
    realtime_db,
    rich_text_components,
    schema,
    schema_categories,
    sdk_documents,
    sdk_realtime_db,
    sdk_schema,
)

app = FastAPI(title="DashTro CMS API", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Added after CORS so it wraps CORS (becomes outermost) and still lets
# preflight OPTIONS requests through untouched.
app.add_middleware(CMSAuthMiddleware)


# Unauthenticated liveness check for Docker/orchestrator health probes.
# Registered before the routers/SPA fallback below so nothing shadows it.
@app.get("/health")
async def health():
    return {"status": "ok"}


# FastAPI's default 422 body has `detail` as a list of error objects, unlike
# every other error response in this app (`detail` as a plain string). The
# frontend renders `detail` directly in a toast, so flatten it to a string
# here to keep that consistent.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        msg = err.get("msg", "Invalid input")
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, ") :]
        messages.append(msg)
    return JSONResponse(status_code=422, content={"detail": "; ".join(messages) or "Invalid input"})


app.include_router(auth.router, prefix="/api/cms")
app.include_router(projects.router, prefix="/api/cms")
app.include_router(schema.router, prefix="/api/cms")
app.include_router(schema_categories.router, prefix="/api/cms")
app.include_router(collections.router, prefix="/api/cms")
app.include_router(documents.router, prefix="/api/cms")
app.include_router(media.router, prefix="/api/cms")
app.include_router(audit.router, prefix="/api/cms")
app.include_router(field_types.router, prefix="/api/cms")
app.include_router(rich_text_components.router, prefix="/api/cms")
app.include_router(realtime_db.router, prefix="/api/cms")

# External SDK access — API-key auth (X-API-Key), not JWT. CMSAuthMiddleware
# only inspects /api/cms/, so it never touches these routes.
app.include_router(sdk_documents.router, prefix="/api/sdk")
app.include_router(sdk_realtime_db.router, prefix="/api/sdk")
app.include_router(sdk_schema.router, prefix="/api/sdk")

# Built frontend (cms-frontend/dist), copied to /app/static by the combined
# Dockerfile at repo root. Absent in local/dev-container runs where the
# frontend is served separately (Vite dev server) — only mount it when present.
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    # SPA fallback: any non-API path serves index.html so client-side routing
    # (react-router) resolves on a hard refresh/direct link. Registered last so
    # it never shadows the API routers above.
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        return FileResponse(STATIC_DIR / "index.html")
