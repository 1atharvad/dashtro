import hashlib
import logging
from datetime import UTC, datetime

import jwt
from api.utils import get_audit_client, get_auth_client, get_email_client
from api.utils.actor import get_client_ip
from config import DEBUG
from decouple import config as env_config
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, field_validator

router = APIRouter()
db_auth = get_auth_client()
db_audit = get_audit_client()

_PASSWORD_RESET_TTL_SECONDS = 900  # 15 minutes


# idToken/refreshToken are httpOnly cookies, never exposed to frontend JS —
# see cms-frontend/src/ts/utils/auth.ts for why (XSS-safe token storage).
def _is_secure_request(request: Request) -> bool:
    # `secure=True` makes browsers/HTTP clients silently drop the cookie over
    # plain HTTP (local dev, TestClient's http://testserver) — so this must
    # track the actual request scheme, not DEBUG. Behind a reverse proxy
    # (e.g. Render) TLS is terminated upstream, so trust X-Forwarded-Proto.
    return request.headers.get("x-forwarded-proto", request.url.scheme) == "https"


def _set_auth_cookies(
    request: Request, response: Response, id_token: str, refresh_token: str
) -> None:
    kwargs = {
        "httponly": True,
        "secure": _is_secure_request(request),
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie("idToken", id_token, **kwargs)
    response.set_cookie("refreshToken", refresh_token, **kwargs)


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("idToken", path="/")
    response.delete_cookie("refreshToken", path="/")


def _public_base_url(request: Request) -> str:
    public_url = env_config("CMS_PUBLIC_URL", default="")
    if public_url:
        return public_url.rstrip("/")
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    return f"{scheme}://{request.url.netloc}"


def _pwd_sig(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def _make_reset_token(uid: str, password_hash: str) -> str:
    # Embeds a fingerprint of the *current* password hash, so the token
    # stops verifying the moment the password changes — a stateless
    # single-use token with no extra DB table for reset requests.
    secret = env_config("JWT_SECRET_KEY")
    now_ts = int(datetime.now(tz=UTC).timestamp())
    payload = {
        "uid": uid,
        "purpose": "password_reset",
        "pwd_sig": _pwd_sig(password_hash),
        "exp": now_ts + _PASSWORD_RESET_TTL_SECONDS,
        "iat": now_ts,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def _verify_reset_token(token: str) -> str:
    secret = env_config("JWT_SECRET_KEY")
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Reset link has expired") from None
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Reset link is invalid") from None

    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Reset link is invalid")

    uid = payload["uid"]
    current_hash = db_auth.get_password_hash(uid)
    if not current_hash or _pwd_sig(current_hash) != payload.get("pwd_sig"):
        raise HTTPException(
            status_code=400, detail="Reset link is invalid or has already been used"
        )
    return uid


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
    first_name: str = ""
    last_name: str = ""

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        return _validate_password_strength(v)


@router.get("/auth/owner-exists/")
def owner_exists():
    return {"exists": db_auth.owner_exists()}


@router.post("/auth/signup/")
def signup(body: SignupRequest, request: Request):
    if db_auth.owner_exists():
        raise HTTPException(status_code=409, detail="Owner already exists")
    try:
        user_id = db_auth.create_user(
            body.email,
            body.password,
            role="Owner",
            first_name=body.first_name,
            last_name=body.last_name,
        )
        db_audit.log(
            action="signup",
            resource_type="user",
            user_id=user_id,
            user_email=body.email,
            resource_id=user_id,
            resource_name=body.email,
            ip_address=get_client_ip(request),
        )
        return {"message": "Owner account created", "uid": user_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/auth/")
def get_auth(request: Request):
    try:
        id_token = _extract_id_token(request)
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
        raise HTTPException(status_code=401, detail=str(e)) from e


@router.post("/auth/refresh/")
def refresh(request: Request, response: Response):
    refresh_token = request.cookies.get("refreshToken")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Authentication cookie missing")
    try:
        user_data = db_auth.verify_id_token(refresh_token)
        result = db_auth.refresh_tokens(user_data["uid"], user_data["email"])
        _set_auth_cookies(request, response, result["idToken"], result["refreshToken"])
        return {"message": "Refreshed"}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e)) from e


@router.post("/auth/login/")
def login(body: LoginRequest, request: Request, response: Response):
    if not db_auth.owner_exists():
        raise HTTPException(status_code=404, detail="No account has been set up yet")
    try:
        result = db_auth.login_user(body.email, body.password)
        db_audit.log(
            action="login",
            resource_type="user",
            user_id=result["localId"],
            user_email=body.email,
            resource_id=result["localId"],
            resource_name=body.email,
            ip_address=get_client_ip(request),
        )
        _set_auth_cookies(request, response, result["idToken"], result["refreshToken"])
        return {"message": "Logged in", "localId": result["localId"]}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e)) from e


@router.post("/auth/logout/")
def logout(response: Response):
    _clear_auth_cookies(response)
    return {"message": "Logged out"}


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v):
        return _validate_password_strength(v)


@router.post("/auth/forgot-password/")
def forgot_password(body: ForgotPasswordRequest, request: Request):
    # Always the same response whether or not the email is registered —
    # an unauthenticated caller must not be able to enumerate accounts.
    user = db_auth.get_user_by_email(body.email)
    if user:
        base_url = _public_base_url(request)
        reset_token = _make_reset_token(user["uid"], user["password_hash"])
        reset_url = f"{base_url}/reset-password/?token={reset_token}"
        logo_url = f"{base_url}/dashtro-logo.png"
        try:
            get_email_client().send_password_reset_email(body.email, reset_url, logo_url)
        except Exception:
            # Delivery failures stay invisible to the caller (anti-enumeration),
            # but must be visible *somewhere* or misconfigured SMTP/Resend
            # creds fail completely silently. Logged, not raised.
            logging.getLogger(__name__).exception(
                "Failed to send password-reset email to %s", body.email
            )
    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/auth/reset-password/")
def reset_password(body: ResetPasswordRequest):
    uid = _verify_reset_token(body.token)
    db_auth.reset_password(uid, body.new_password)
    return {"message": "Password updated"}


@router.post("/auth/")
def post_auth(request: Request):
    id_token = _extract_id_token(request)
    try:
        user_data = db_auth.verify_id_token(id_token)
        return {"message": "Token valid", "user": user_data}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e)) from e


def _extract_id_token(request: Request) -> str:
    if DEBUG:
        return db_auth.get_admin_token_id()
    id_token = request.cookies.get("idToken")
    if not id_token:
        raise HTTPException(status_code=401, detail="Authentication cookie missing")
    return id_token


def _get_uid(request: Request) -> str:
    return db_auth.verify_id_token(_extract_id_token(request))["uid"]


def _get_user(request: Request) -> dict:
    return db_auth.verify_id_token(_extract_id_token(request))


@router.get("/auth/users/")
def list_users(request: Request):
    try:
        _get_uid(request)
        return db_auth.list_users()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e)) from e


@router.delete("/auth/users/{uid}/")
def delete_user(uid: str, request: Request):
    try:
        current_user = _get_user(request)
        if current_user["uid"] == uid:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        db_auth.delete_user(uid)
        db_audit.log(
            action="delete_user",
            resource_type="user",
            user_id=current_user["uid"],
            user_email=current_user["email"],
            resource_id=uid,
            ip_address=get_client_ip(request),
        )
        return {"message": "User removed"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v):
        return _validate_password_strength(v)


@router.post("/auth/change-password/")
def change_password(body: ChangePasswordRequest, request: Request):
    try:
        user = _get_user(request)
        db_auth.change_password(user["uid"], body.current_password, body.new_password)
        db_audit.log(
            action="change_password",
            resource_type="user",
            user_id=user["uid"],
            user_email=user["email"],
            resource_id=user["uid"],
            ip_address=get_client_ip(request),
        )
        return {"message": "Password updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class ProfileUpdateRequest(BaseModel):
    first_name: str = ""
    last_name: str = ""


@router.patch("/auth/profile/")
def update_profile(body: ProfileUpdateRequest, request: Request):
    try:
        user = _get_user(request)
        db_auth.update_name(user["uid"], body.first_name, body.last_name)
        db_audit.log(
            action="update_profile",
            resource_type="user",
            user_id=user["uid"],
            user_email=user["email"],
            resource_id=user["uid"],
            details={"first_name": body.first_name, "last_name": body.last_name},
            ip_address=get_client_ip(request),
        )
        return {"message": "Profile updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class CreateApiKeyRequest(BaseModel):
    label: str
    project_id: str | None = None
    collections: list[str] | None = None
    scopes: list[str] | None = None


@router.get("/auth/api-keys/")
def list_api_keys(request: Request):
    try:
        _get_uid(request)
        return db_auth.list_api_keys()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e)) from e


@router.post("/auth/api-keys/")
def create_api_key_multi(body: CreateApiKeyRequest, request: Request):
    try:
        user = _get_user(request)
        if user.get("role") not in ("Owner", "Admin"):
            raise HTTPException(status_code=403, detail="Only Owner or Admin can create API keys")
        new_key = db_auth.create_api_key(
            body.label,
            user["uid"],
            project_id=body.project_id,
            collections=body.collections,
            scopes=body.scopes,
        )
        db_audit.log(
            action="create_api_key",
            resource_type="api_key",
            user_id=user["uid"],
            user_email=user["email"],
            resource_id=new_key["id"],
            resource_name=body.label,
            ip_address=get_client_ip(request),
        )
        return new_key
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/auth/api-keys/{key_id}/")
def delete_api_key_multi(key_id: str, request: Request):
    try:
        user = _get_user(request)
        if user.get("role") not in ("Owner", "Admin"):
            raise HTTPException(status_code=403, detail="Only Owner or Admin can delete API keys")
        db_auth.delete_api_key(key_id)
        db_audit.log(
            action="delete_api_key",
            resource_type="api_key",
            user_id=user["uid"],
            user_email=user["email"],
            resource_id=key_id,
            ip_address=get_client_ip(request),
        )
        return {"message": "API key deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.patch("/auth/api-keys/{key_id}/revoke/")
def revoke_api_key(key_id: str, request: Request):
    try:
        user = _get_user(request)
        if user.get("role") not in ("Owner", "Admin"):
            raise HTTPException(status_code=403, detail="Only Owner or Admin can revoke API keys")
        db_auth.revoke_api_key(key_id)
        db_audit.log(
            action="revoke_api_key",
            resource_type="api_key",
            user_id=user["uid"],
            user_email=user["email"],
            resource_id=key_id,
            ip_address=get_client_ip(request),
        )
        return {"message": "API key revoked"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/auth/api-key/")
def generate_api_key(request: Request):
    try:
        id_token = _extract_id_token(request)
        user_data = db_auth.verify_id_token(id_token)
        api_key = db_auth.generate_api_key(user_data["uid"])
        return {"api_key": api_key}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e)) from e


@router.get("/auth/api-key/")
def get_api_key(request: Request):
    try:
        id_token = _extract_id_token(request)
        user_data = db_auth.verify_id_token(id_token)
        api_key = db_auth.get_api_key(user_data["uid"])
        return {"api_key": api_key}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
