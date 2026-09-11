from decouple import config

from .audit_client import SqliteAuditClient
from .email_client import EmailClient, ResendEmailClient, SmtpEmailClient
from .postgres_audit_client import PostgresAuditClient
from .postgres_client import PostgresAuth, PostgresData
from .sqlite_client import SqliteAuth, SqliteData

_DB_TYPE = config("DB_TYPE", default="sqlite")
_SUPPORTED_DB_TYPES = ("sqlite", "postgres")

_EMAIL_PROVIDER = config("EMAIL_PROVIDER", default="smtp")
_SUPPORTED_EMAIL_PROVIDERS = ("smtp", "resend")


def get_data_client():
    if _DB_TYPE == "postgres":
        return PostgresData()
    if _DB_TYPE == "sqlite":
        return SqliteData()
    raise NotImplementedError(
        f"DB_TYPE={_DB_TYPE!r} is not supported yet; use one of {_SUPPORTED_DB_TYPES}"
    )


def get_auth_client():
    if _DB_TYPE == "postgres":
        return PostgresAuth()
    if _DB_TYPE == "sqlite":
        return SqliteAuth()
    raise NotImplementedError(
        f"DB_TYPE={_DB_TYPE!r} is not supported yet; use one of {_SUPPORTED_DB_TYPES}"
    )


def get_audit_client() -> SqliteAuditClient | PostgresAuditClient:
    if _DB_TYPE == "postgres":
        return PostgresAuditClient()
    return SqliteAuditClient()


def get_email_client() -> EmailClient:
    if _EMAIL_PROVIDER == "resend":
        return EmailClient(ResendEmailClient())
    if _EMAIL_PROVIDER == "smtp":
        return EmailClient(SmtpEmailClient())
    raise NotImplementedError(
        f"EMAIL_PROVIDER={_EMAIL_PROVIDER!r} is not supported yet; "
        f"use one of {_SUPPORTED_EMAIL_PROVIDERS}"
    )


__all__ = [
    "SqliteData",
    "SqliteAuth",
    "SqliteAuditClient",
    "PostgresData",
    "PostgresAuth",
    "PostgresAuditClient",
    "EmailClient",
    "SmtpEmailClient",
    "ResendEmailClient",
    "get_data_client",
    "get_auth_client",
    "get_audit_client",
    "get_email_client",
]
