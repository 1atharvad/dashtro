from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, field_validator
from api.utils import get_auth_client, get_audit_client
from api.utils.actor import get_client_ip
from config import DEBUG

router = APIRouter()
db_auth = get_auth_client()
db_audit = get_audit_client()


def _validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    return v


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str
    first_name: str = ''
    last_name: str = ''

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        return _validate_password_strength(v)


class RefreshRequest(BaseModel):
    refresh_token: str


@router.get("/auth/owner-exists/")
def owner_exists():
    return {"exists": db_auth.owner_exists()}


@router.post("/auth/signup/")
def signup(body: SignupRequest, request: Request):
    if db_auth.owner_exists():
        raise HTTPException(status_code=409, detail="Owner already exists")
    try:
        user_id = db_auth.create_user(body.email, body.password, role='Owner', first_name=body.first_name, last_name=body.last_name)
        db_audit.log(action='signup', resource_type='user', user_id=user_id, user_email=body.email,
                     resource_id=user_id, resource_name=body.email, ip_address=get_client_ip(request))
        return {"message": "Owner account created", "uid": user_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/auth/")
def get_auth(authorization: str = Header(default=None)):
    try:
        if DEBUG:
            id_token = db_auth.get_admin_token_id()
        else:
            if not authorization or not authorization.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
            id_token = authorization[len("Bearer "):].strip()
        uid = db_auth.verify_id_token(id_token)
        return {
            "message": "Authenticated",
            "uid": uid["uid"],
            "email": uid["email"],
            "email_verified": uid["email_verified"],
            "first_name": uid.get("first_name", ""),
            "last_name": uid.get("last_name", ""),
            "role": uid.get("role", "Member"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/auth/refresh/")
def refresh(body: RefreshRequest):
    try:
        user_data = db_auth.verify_id_token(body.refresh_token)
        result = db_auth.refresh_tokens(user_data["uid"], user_data["email"])
        return {"idToken": result["idToken"], "refreshToken": result["refreshToken"]}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/auth/login/")
def login(body: LoginRequest, request: Request):
    try:
        result = db_auth.login_user(body.email, body.password)
        db_audit.log(action='login', resource_type='user', user_id=result['localId'], user_email=body.email,
                     resource_id=result['localId'], resource_name=body.email, ip_address=get_client_ip(request))
        return result
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/auth/")
def post_auth(authorization: str = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
    id_token = authorization[len("Bearer "):].strip()

    try:
        user_data = db_auth.verify_id_token(id_token)
        return {"message": "Token valid", "user": user_data}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


def _get_uid(authorization: str | None) -> str:
    if DEBUG:
        id_token = db_auth.get_admin_token_id()
    else:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
        id_token = authorization[len("Bearer "):].strip()
    return db_auth.verify_id_token(id_token)["uid"]


def _get_user(authorization: str | None) -> dict:
    if DEBUG:
        id_token = db_auth.get_admin_token_id()
    else:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
        id_token = authorization[len("Bearer "):].strip()
    return db_auth.verify_id_token(id_token)


@router.get("/auth/users/")
def list_users(authorization: str = Header(default=None)):
    try:
        _get_uid(authorization)
        return db_auth.list_users()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.delete("/auth/users/{uid}/")
def delete_user(uid: str, request: Request, authorization: str = Header(default=None)):
    try:
        current_user = _get_user(authorization)
        if current_user["uid"] == uid:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        db_auth.delete_user(uid)
        db_audit.log(action='delete_user', resource_type='user', user_id=current_user["uid"],
                     user_email=current_user["email"], resource_id=uid, ip_address=get_client_ip(request))
        return {"message": "User removed"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v):
        return _validate_password_strength(v)


@router.post("/auth/change-password/")
def change_password(body: ChangePasswordRequest, request: Request, authorization: str = Header(default=None)):
    try:
        user = _get_user(authorization)
        db_auth.change_password(user["uid"], body.current_password, body.new_password)
        db_audit.log(action='change_password', resource_type='user', user_id=user["uid"],
                     user_email=user["email"], resource_id=user["uid"], ip_address=get_client_ip(request))
        return {"message": "Password updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class ProfileUpdateRequest(BaseModel):
    first_name: str = ''
    last_name: str = ''


@router.patch("/auth/profile/")
def update_profile(body: ProfileUpdateRequest, request: Request, authorization: str = Header(default=None)):
    try:
        user = _get_user(authorization)
        db_auth.update_name(user["uid"], body.first_name, body.last_name)
        db_audit.log(action='update_profile', resource_type='user', user_id=user["uid"],
                     user_email=user["email"], resource_id=user["uid"],
                     details={'first_name': body.first_name, 'last_name': body.last_name},
                     ip_address=get_client_ip(request))
        return {"message": "Profile updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class CreateApiKeyRequest(BaseModel):
    label: str


@router.get("/auth/api-keys/")
def list_api_keys(authorization: str = Header(default=None)):
    try:
        _get_uid(authorization)
        return db_auth.list_api_keys()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/auth/api-keys/")
def create_api_key_multi(body: CreateApiKeyRequest, request: Request, authorization: str = Header(default=None)):
    try:
        user = _get_user(authorization)
        if user.get("role") not in ("Owner", "Admin"):
            raise HTTPException(status_code=403, detail="Only Owner or Admin can create API keys")
        new_key = db_auth.create_api_key(body.label, user["uid"])
        db_audit.log(action='create_api_key', resource_type='api_key', user_id=user["uid"],
                     user_email=user["email"], resource_id=new_key['id'], resource_name=body.label,
                     ip_address=get_client_ip(request))
        return new_key
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/auth/api-keys/{key_id}/")
def delete_api_key_multi(key_id: str, request: Request, authorization: str = Header(default=None)):
    try:
        user = _get_user(authorization)
        if user.get("role") not in ("Owner", "Admin"):
            raise HTTPException(status_code=403, detail="Only Owner or Admin can delete API keys")
        db_auth.delete_api_key(key_id)
        db_audit.log(action='delete_api_key', resource_type='api_key', user_id=user["uid"],
                     user_email=user["email"], resource_id=key_id, ip_address=get_client_ip(request))
        return {"message": "API key deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auth/api-key/")
def generate_api_key(authorization: str = Header(default=None)):
    try:
        if DEBUG:
            id_token = db_auth.get_admin_token_id()
        else:
            if not authorization or not authorization.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
            id_token = authorization[len("Bearer "):].strip()
        user_data = db_auth.verify_id_token(id_token)
        api_key = db_auth.generate_api_key(user_data["uid"])
        return {"api_key": api_key}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/auth/api-key/")
def get_api_key(authorization: str = Header(default=None)):
    try:
        if DEBUG:
            id_token = db_auth.get_admin_token_id()
        else:
            if not authorization or not authorization.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
            id_token = authorization[len("Bearer "):].strip()
        user_data = db_auth.verify_id_token(id_token)
        api_key = db_auth.get_api_key(user_data["uid"])
        return {"api_key": api_key}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
