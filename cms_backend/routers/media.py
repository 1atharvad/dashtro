import mimetypes
import uuid
from pathlib import Path

from api.utils import get_audit_client
from api.utils.actor import get_actor, get_client_ip
from decouple import config
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/avif", ".avif")

router = APIRouter()
db_audit = get_audit_client()

# Defaults to the Docker container path; overridable so the app (and its test
# suite) can also run outside that container, e.g. on a local dev machine.
UPLOAD_DIR = Path(config("MEDIA_UPLOAD_DIR", default="/app/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/avif",
}

ALLOWED_TYPES = ALLOWED_IMAGE_TYPES | {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/x-zip-compressed",
    "application/json",
    "text/plain",
    "text/csv",
    "video/mp4",
    "video/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("/media/files/{filename}")
async def serve_file(filename: str):
    path = UPLOAD_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    media_type, _ = mimetypes.guess_type(filename)
    return FileResponse(path, media_type=media_type or "application/octet-stream")


@router.post("/media/", status_code=201)
async def upload_image(request: Request, file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")

    ext = Path(file.filename or "upload").suffix.lower() or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / filename).write_bytes(contents)

    actor = get_actor(request)
    db_audit.log(
        action="upload_media",
        resource_type="media",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_name=file.filename or filename,
        details={
            "content_type": file.content_type,
            "size_bytes": len(contents),
            "filename": filename,
        },
        ip_address=get_client_ip(request),
    )

    return {"url": f"/api/cms/media/files/{filename}", "filename": filename}


@router.put("/media/files/{filename}")
async def restore_file(filename: str, request: Request, file: UploadFile = File(...)):
    """Writes a file back under an exact, caller-chosen filename — used only by the
    backup CLI's `media import` to restore uploads without breaking document
    references (unlike POST /media/, which always mints a fresh random name)."""
    if "/" in filename or "\\" in filename or filename in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")

    (UPLOAD_DIR / filename).write_bytes(contents)

    actor = get_actor(request)
    db_audit.log(
        action="restore_media",
        resource_type="media",
        user_id=actor["uid"],
        user_email=actor["email"],
        resource_name=filename,
        details={"content_type": file.content_type, "size_bytes": len(contents)},
        ip_address=get_client_ip(request),
    )

    return {"url": f"/api/cms/media/files/{filename}", "filename": filename}
