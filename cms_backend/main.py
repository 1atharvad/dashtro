from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from config import CORS_ORIGINS
from routers import auth, schema, schema_categories, collections, documents, projects, media, audit, field_types

app = FastAPI(title="DashTro CMS API", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/cms")
app.include_router(projects.router, prefix="/api/cms")
app.include_router(schema.router, prefix="/api/cms")
app.include_router(schema_categories.router, prefix="/api/cms")
app.include_router(collections.router, prefix="/api/cms")
app.include_router(documents.router, prefix="/api/cms")
app.include_router(media.router, prefix="/api/cms")
app.include_router(audit.router, prefix="/api/cms")
app.include_router(field_types.router, prefix="/api/cms")

_upload_dir = Path("/app/uploads")
_upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/api/cms/media/files", StaticFiles(directory=str(_upload_dir)), name="media")
