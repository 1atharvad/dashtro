import uuid
from pathlib import Path
from fastapi import APIRouter, Header, HTTPException, Request, UploadFile, File
from api.utils import get_audit_client
from api.utils.actor import try_get_actor, get_client_ip

router = APIRouter()
db_audit = get_audit_client()

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/avif"}

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


@router.post("/media/", status_code=201)
async def upload_image(request: Request, file: UploadFile = File(...), authorization: str = Header(default=None)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")

    ext = Path(file.filename or "upload").suffix.lower() or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / filename).write_bytes(contents)

    actor = try_get_actor(authorization)
    db_audit.log(action='upload_media', resource_type='media', user_id=actor['uid'],
                 user_email=actor['email'], resource_name=file.filename or filename,
                 details={'content_type': file.content_type, 'size_bytes': len(contents), 'filename': filename},
                 ip_address=get_client_ip(request))

    return {"url": f"/api/cms/media/files/{filename}", "filename": filename}
