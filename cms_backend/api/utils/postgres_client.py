import hashlib
import os
import secrets
import threading
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import jwt
import psycopg2
import psycopg2.extras
from api.utils.schema import reindex_schema_after_delete
from api.utils.workspace_diff import diff_workspaces
from decouple import config


class PostgresClient:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super().__new__(cls, *args, **kwargs)
            cls._instance._local = threading.local()
        return cls._instance

    @staticmethod
    def _create_connection():
        conn = psycopg2.connect(
            host=config("DB_HOST", default="localhost"),
            port=config("DB_PORT", default="5432"),
            dbname=config("DB_NAME"),
            user=config("DB_USER"),
            password=config("DB_PASSWORD"),
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
        # Autocommit by default: unlike sqlite3, psycopg2 opens an implicit
        # transaction on every statement (including plain SELECTs) and holds
        # it open until an explicit commit/rollback. Without autocommit, a
        # read-only method that never calls commit() would leave a lingering
        # "idle in transaction" session holding locks indefinitely. Methods
        # that need atomicity across multiple statements (the promote/pull
        # pipeline, cascading deletes) toggle this off for their duration.
        conn.autocommit = True
        return conn

    @property
    def connection(self):
        local = self._local
        if not hasattr(local, "conn") or local.conn is None:
            local.conn = self._create_connection()
        return local.conn

    @connection.setter
    def connection(self, value):
        self._local.conn = value

    def get_cursor(self):
        try:
            with self.connection.cursor() as probe:
                probe.execute("SELECT 1")
            self.connection.rollback()
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            self.connection = self._create_connection()
        return self.connection.cursor()

    @contextmanager
    def transaction(self):
        """Run multiple statements atomically (commit-all-or-rollback).

        The connection is autocommit by default (see `_create_connection`),
        so this temporarily switches to a manual transaction for the
        duration of the `with` block only.
        """
        self.connection.autocommit = False
        try:
            yield
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise
        finally:
            self.connection.autocommit = True


class PostgresAuth(PostgresClient):
    def __init__(self):
        super().__init__()
        self._ensure_users_table()
        self._ensure_api_keys_table()

    def _ensure_users_table(self):
        cursor = self.get_cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cms_users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                api_key TEXT,
                display_name TEXT,
                first_name TEXT,
                last_name TEXT,
                role TEXT DEFAULT 'Member',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)
        self.connection.commit()
        cursor.close()

    @staticmethod
    def _hash_password(password: str) -> str:
        salt = os.urandom(16).hex()
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
        return f"pbkdf2:{salt}:{dk.hex()}"

    @staticmethod
    def _verify_password(password: str, hashed: str) -> bool:
        try:
            _, salt, dk_hex = hashed.split(":")
            dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
            return dk.hex() == dk_hex
        except Exception:
            return False

    def create_user(
        self,
        email: str,
        password: str,
        role: str = "Member",
        first_name: str = "",
        last_name: str = "",
    ):
        user_id = str(uuid.uuid4().hex)
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_users (id, email, password, role, first_name, last_name) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (user_id, email, self._hash_password(password), role, first_name, last_name),
        )
        self.connection.commit()
        cursor.close()
        return user_id

    def verify_id_token(self, id_token):
        secret = config("JWT_SECRET_KEY")
        try:
            payload = jwt.decode(id_token, secret, algorithms=["HS256"])
            cursor = self.get_cursor()
            cursor.execute(
                "SELECT first_name, last_name, role FROM cms_users WHERE id=%s", (payload["uid"],)
            )
            row = cursor.fetchone()
            cursor.close()
            return {
                "uid": payload["uid"],
                "email": payload["email"],
                "email_verified": payload.get("email_verified", True),
                "first_name": row["first_name"] if row else "",
                "last_name": row["last_name"] if row else "",
                "role": row["role"] if row and row["role"] else "Member",
            }
        except jwt.ExpiredSignatureError:
            raise Exception("Token verification failed: Token has expired") from None
        except jwt.InvalidTokenError as e:
            raise Exception(f"Token verification failed: {str(e)}") from e

    def login_user(self, email: str, password: str):
        cursor = self.get_cursor()
        cursor.execute("SELECT id, email, password FROM cms_users WHERE email=%s", (email,))
        row = cursor.fetchone()
        cursor.close()

        if not row or not self._verify_password(password, row["password"]):
            raise Exception("Login failed: INVALID_CREDENTIALS")

        secret = config("JWT_SECRET_KEY")
        now = datetime.now(tz=UTC)
        payload = {
            "uid": str(row["id"]),
            "email": row["email"],
            "email_verified": True,
            "exp": now + timedelta(hours=1),
            "iat": now,
        }
        id_token = jwt.encode(payload, secret, algorithm="HS256")
        refresh_payload = {**payload, "exp": now + timedelta(days=30)}
        refresh_token = jwt.encode(refresh_payload, secret, algorithm="HS256")

        return {
            "idToken": id_token,
            "refreshToken": refresh_token,
            "localId": str(row["id"]),
        }

    def refresh_tokens(self, uid: str, email: str):
        secret = config("JWT_SECRET_KEY")
        now = datetime.now(tz=UTC)
        payload = {
            "uid": uid,
            "email": email,
            "email_verified": True,
            "exp": now + timedelta(hours=1),
            "iat": now,
        }
        id_token = jwt.encode(payload, secret, algorithm="HS256")
        refresh_payload = {**payload, "exp": now + timedelta(days=30)}
        refresh_token = jwt.encode(refresh_payload, secret, algorithm="HS256")
        return {"idToken": id_token, "refreshToken": refresh_token}

    def list_users(self) -> list:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT id, email, first_name, last_name, role FROM cms_users ORDER BY created_at"
        )
        rows = cursor.fetchall()
        cursor.close()
        return [
            {
                "uid": r["id"],
                "email": r["email"],
                "first_name": r["first_name"] or "",
                "last_name": r["last_name"] or "",
                "role": r["role"] or "Member",
            }
            for r in rows
        ]

    def delete_user(self, uid: str):
        cursor = self.get_cursor()
        cursor.execute("DELETE FROM cms_users WHERE id=%s", (uid,))
        self.connection.commit()
        cursor.close()

    def change_password(self, uid: str, current_password: str, new_password: str):
        cursor = self.get_cursor()
        cursor.execute("SELECT password FROM cms_users WHERE id=%s", (uid,))
        row = cursor.fetchone()
        cursor.close()
        if not row or not self._verify_password(current_password, row["password"]):
            raise Exception("Current password is incorrect")
        cursor = self.get_cursor()
        cursor.execute(
            "UPDATE cms_users SET password=%s WHERE id=%s",
            (self._hash_password(new_password), uid),
        )
        self.connection.commit()
        cursor.close()

    def update_name(self, uid: str, first_name: str, last_name: str):
        cursor = self.get_cursor()
        cursor.execute(
            "UPDATE cms_users SET first_name=%s, last_name=%s WHERE id=%s",
            (first_name, last_name, uid),
        )
        self.connection.commit()
        cursor.close()

    def _ensure_api_keys_table(self):
        cursor = self.get_cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cms_api_keys (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                key TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                project_id TEXT,
                collections JSONB,
                scopes JSONB,
                revoked_at TIMESTAMPTZ,
                last_used_at TIMESTAMPTZ
            );
        """)
        self.connection.commit()
        cursor.close()

    @staticmethod
    def _api_key_row(r) -> dict:
        return {
            "id": r["id"],
            "label": r["label"],
            "key": r["key"],
            "created_by": r["created_by"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "project_id": r["project_id"],
            "collections": r["collections"] if r["collections"] else [],
            "scopes": r["scopes"] if r["scopes"] else ["read"],
            "revoked_at": r["revoked_at"].isoformat() if r["revoked_at"] else None,
            "last_used_at": r["last_used_at"].isoformat() if r["last_used_at"] else None,
        }

    def list_api_keys(self) -> list:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT id, label, key, created_by, created_at, project_id, collections, scopes, "
            "revoked_at, last_used_at FROM cms_api_keys ORDER BY created_at DESC"
        )
        rows = cursor.fetchall()
        cursor.close()
        return [self._api_key_row(r) for r in rows]

    def create_api_key(
        self,
        label: str,
        created_by: str,
        project_id: str | None = None,
        collections: list | None = None,
        scopes: list | None = None,
    ) -> dict:
        key_id = str(uuid.uuid4().hex)
        key = secrets.token_urlsafe(32)
        now = datetime.now(tz=UTC)
        scopes = scopes or ["read"]
        collections = collections or []
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_api_keys (id, label, key, created_by, created_at, project_id, collections, scopes) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (
                key_id,
                label,
                key,
                created_by,
                now,
                project_id,
                psycopg2.extras.Json(collections),
                psycopg2.extras.Json(scopes),
            ),
        )
        self.connection.commit()
        cursor.close()
        return {
            "id": key_id,
            "label": label,
            "key": key,
            "created_by": created_by,
            "created_at": now.isoformat(),
            "project_id": project_id,
            "collections": collections,
            "scopes": scopes,
            "revoked_at": None,
            "last_used_at": None,
        }

    def delete_api_key(self, key_id: str):
        cursor = self.get_cursor()
        cursor.execute("DELETE FROM cms_api_keys WHERE id=%s", (key_id,))
        self.connection.commit()
        cursor.close()

    def revoke_api_key(self, key_id: str):
        cursor = self.get_cursor()
        cursor.execute(
            "UPDATE cms_api_keys SET revoked_at=%s WHERE id=%s",
            (datetime.now(tz=UTC), key_id),
        )
        self.connection.commit()
        cursor.close()

    def verify_api_key(self, key: str) -> dict | None:
        """Look up a non-revoked API key by its secret value and return its scope info."""
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT id, label, key, created_by, created_at, project_id, collections, scopes, "
            "revoked_at, last_used_at FROM cms_api_keys WHERE key=%s",
            (key,),
        )
        row = cursor.fetchone()
        cursor.close()
        if not row or row["revoked_at"]:
            return None
        cursor = self.get_cursor()
        cursor.execute(
            "UPDATE cms_api_keys SET last_used_at=%s WHERE id=%s",
            (datetime.now(tz=UTC), row["id"]),
        )
        self.connection.commit()
        cursor.close()
        return self._api_key_row(row)

    def generate_api_key(self, uid: str) -> str:
        api_key = secrets.token_urlsafe(32)
        cursor = self.get_cursor()
        cursor.execute("UPDATE cms_users SET api_key=%s WHERE id=%s", (api_key, uid))
        self.connection.commit()
        cursor.close()
        return api_key

    def get_api_key(self, uid: str) -> str | None:
        cursor = self.get_cursor()
        cursor.execute("SELECT api_key FROM cms_users WHERE id=%s", (uid,))
        row = cursor.fetchone()
        cursor.close()
        return row["api_key"] if row else None

    def owner_exists(self) -> bool:
        cursor = self.get_cursor()
        cursor.execute("SELECT COUNT(*) AS count FROM cms_users")
        count = cursor.fetchone()["count"]
        cursor.close()
        return count > 0

    def get_admin_token_id(self):
        cursor = self.get_cursor()
        cursor.execute("SELECT id, email FROM cms_users ORDER BY created_at LIMIT 1")
        row = cursor.fetchone()
        cursor.close()
        if not row:
            raise Exception("No users exist. Please sign up first.")
        secret = config("JWT_SECRET_KEY")
        now = datetime.now(tz=UTC)
        payload = {
            "uid": row["id"],
            "email": row["email"],
            "email_verified": True,
            "exp": now + timedelta(hours=1),
            "iat": now,
        }
        return jwt.encode(payload, secret, algorithm="HS256")


class PostgresData(PostgresClient):
    def __init__(self):
        if not hasattr(self, "_caches"):
            self._caches: dict[str, dict] = {}
        self._ensure_tables()
        self._ensure_versions_table()

    def _ensure_tables(self):
        cursor = self.get_cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cms_projects (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS cms_workspaces (
                project_id TEXT NOT NULL,
                workspace_name TEXT NOT NULL,
                data JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (project_id, workspace_name)
            );
            CREATE TABLE IF NOT EXISTS cms_project_schema (
                project_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data JSONB NOT NULL,
                PRIMARY KEY (project_id, id)
            );
            CREATE TABLE IF NOT EXISTS cms_project_collections (
                project_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data JSONB NOT NULL,
                PRIMARY KEY (project_id, id)
            );
            CREATE TABLE IF NOT EXISTS cms_project_workspace_data (
                project_id TEXT NOT NULL,
                workspace_name TEXT NOT NULL,
                collection_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                data JSONB NOT NULL,
                PRIMARY KEY (project_id, workspace_name, collection_id, document_id)
            );
            CREATE TABLE IF NOT EXISTS cms_schema_categories (
                project_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data JSONB NOT NULL,
                PRIMARY KEY (project_id, id)
            );
            CREATE TABLE IF NOT EXISTS cms_schema_category_map (
                project_id TEXT NOT NULL,
                schema_name TEXT NOT NULL,
                category_id TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (project_id, schema_name)
            );
            CREATE TABLE IF NOT EXISTS cms_rich_text_components (
                project_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data JSONB NOT NULL,
                PRIMARY KEY (project_id, id)
            );
            CREATE TABLE IF NOT EXISTS cms_project_rtdb (
                project_id TEXT PRIMARY KEY,
                data JSONB NOT NULL
            );
        """)
        self.connection.commit()
        cursor.close()

    def _ensure_versions_table(self):
        cursor = self.get_cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cms_document_versions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                workspace_name TEXT NOT NULL,
                collection_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                data JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                created_by_id TEXT DEFAULT '',
                created_by_email TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_versions ON cms_document_versions
                (project_id, workspace_name, collection_id, document_id, version_number DESC);
        """)
        self.connection.commit()
        cursor.close()

    # ── Per-project in-memory cache ──────────────────────────────────────────

    def _load_cache(self, project_id: str):
        cursor = self.get_cursor()
        cursor.execute("SELECT id, data FROM cms_project_schema WHERE project_id=%s", (project_id,))
        schema = {row["id"]: row["data"] for row in cursor.fetchall()}

        cursor.execute(
            "SELECT id, data FROM cms_project_collections WHERE project_id=%s", (project_id,)
        )
        collections = {row["id"]: row["data"] for row in cursor.fetchall()}
        cursor.close()

        self._caches[project_id] = {"schema": schema, "schema_collections": collections}

    def _get_cache(self, project_id: str) -> dict:
        if project_id not in self._caches:
            self._load_cache(project_id)
        return self._caches[project_id]

    def _invalidate_cache(self, project_id: str):
        self._caches.pop(project_id, None)

    def get_schema(self, project_id: str) -> dict:
        return self._get_cache(project_id)["schema"]

    def get_collections(self, project_id: str) -> dict:
        return self._get_cache(project_id)["schema_collections"]

    # ── Project CRUD ─────────────────────────────────────────────────────────

    def fetch_all_projects(self) -> list:
        cursor = self.get_cursor()
        cursor.execute("SELECT id, data FROM cms_projects ORDER BY created_at ASC")
        rows = cursor.fetchall()
        cursor.close()
        return [{"_id": row["id"], **row["data"]} for row in rows]

    def get_project(self, project_id: str) -> dict | None:
        cursor = self.get_cursor()
        cursor.execute("SELECT id, data FROM cms_projects WHERE id=%s", (project_id,))
        row = cursor.fetchone()
        cursor.close()
        return {"_id": row["id"], **row["data"]} if row else None

    def upsert_project(self, project_id: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_projects (id, data) VALUES (%s, %s)"
            " ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            (project_id, psycopg2.extras.Json(data)),
        )
        self.connection.commit()
        cursor.close()

    def delete_project_record(self, project_id: str):
        cursor = self.get_cursor()
        with self.transaction():
            cursor.execute("DELETE FROM cms_projects WHERE id=%s", (project_id,))
            cursor.execute("DELETE FROM cms_workspaces WHERE project_id=%s", (project_id,))
            cursor.execute("DELETE FROM cms_project_schema WHERE project_id=%s", (project_id,))
            cursor.execute("DELETE FROM cms_project_collections WHERE project_id=%s", (project_id,))
            cursor.execute(
                "DELETE FROM cms_project_workspace_data WHERE project_id=%s", (project_id,)
            )
        cursor.close()
        self._invalidate_cache(project_id)

    # ── Workspace CRUD ───────────────────────────────────────────────────────

    def fetch_workspaces(self, project_id: str) -> list:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT workspace_name, data FROM cms_workspaces WHERE project_id=%s ORDER BY created_at ASC",
            (project_id,),
        )
        rows = cursor.fetchall()
        cursor.close()
        return [{"workspace_name": row["workspace_name"], **row["data"]} for row in rows]

    def get_workspace(self, project_id: str, workspace_name: str) -> dict | None:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT workspace_name, data FROM cms_workspaces WHERE project_id=%s AND workspace_name=%s",
            (project_id, workspace_name),
        )
        row = cursor.fetchone()
        cursor.close()
        return {"workspace_name": row["workspace_name"], **row["data"]} if row else None

    def upsert_workspace(self, project_id: str, workspace_name: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_workspaces (project_id, workspace_name, data) VALUES (%s, %s, %s)"
            " ON CONFLICT(project_id, workspace_name) DO UPDATE SET data=excluded.data",
            (project_id, workspace_name, psycopg2.extras.Json(data)),
        )
        self.connection.commit()
        cursor.close()

    def delete_workspace_record(self, project_id: str, workspace_name: str):
        cursor = self.get_cursor()
        with self.transaction():
            cursor.execute(
                "DELETE FROM cms_workspaces WHERE project_id=%s AND workspace_name=%s",
                (project_id, workspace_name),
            )
            cursor.execute(
                "DELETE FROM cms_project_workspace_data WHERE project_id=%s AND workspace_name=%s",
                (project_id, workspace_name),
            )
        cursor.close()

    def fetch_all_workspace_documents(self, project_id: str, workspace_name: str) -> list[dict]:
        cursor = self.get_cursor()
        cursor.execute(
            """SELECT collection_id, document_id, data FROM cms_project_workspace_data
               WHERE project_id=%s AND workspace_name=%s AND document_id != '_meta_data'""",
            (project_id, workspace_name),
        )
        rows = cursor.fetchall()
        cursor.close()
        return [
            {"collection_id": r["collection_id"], "document_id": r["document_id"], "data": r["data"]}
            for r in rows
        ]

    def push_workspace_to_production(self, project_id: str, source_workspace: str):
        cursor = self.get_cursor()
        with self.transaction():
            cursor.execute(
                """SELECT collection_id, document_id, data FROM cms_project_workspace_data
                   WHERE project_id=%s AND workspace_name=%s AND document_id != '_meta_data'""",
                (project_id, source_workspace),
            )
            doc_rows = cursor.fetchall()

            cursor.execute(
                """SELECT collection_id, data FROM cms_project_workspace_data
                   WHERE project_id=%s AND workspace_name=%s AND document_id='_meta_data'""",
                (project_id, source_workspace),
            )
            meta_rows = cursor.fetchall()

            # Clear production
            cursor.execute(
                "DELETE FROM cms_project_workspace_data WHERE project_id=%s AND workspace_name='production'",
                (project_id,),
            )

            # Copy every document across unconditionally
            for r in doc_rows:
                cursor.execute(
                    """INSERT INTO cms_project_workspace_data
                       (project_id, workspace_name, collection_id, document_id, data)
                       VALUES (%s, 'production', %s, %s, %s)""",
                    (project_id, r["collection_id"], r["document_id"], psycopg2.extras.Json(r["data"])),
                )

            # Carry meta (sequence/statuses) over unchanged
            for meta_row in meta_rows:
                col = meta_row["collection_id"]
                cursor.execute(
                    """INSERT INTO cms_project_workspace_data
                       (project_id, workspace_name, collection_id, document_id, data)
                       VALUES (%s, 'production', %s, '_meta_data', %s)""",
                    (project_id, col, psycopg2.extras.Json(meta_row["data"])),
                )
        cursor.close()

    def push_collection_to_production(
        self, project_id: str, source_workspace: str, collection_id: str
    ):
        cursor = self.get_cursor()
        with self.transaction():
            cursor.execute(
                """SELECT document_id, data FROM cms_project_workspace_data
                   WHERE project_id=%s AND workspace_name=%s AND collection_id=%s""",
                (project_id, source_workspace, collection_id),
            )
            rows = cursor.fetchall()

            # Replace production's copy of this collection only
            cursor.execute(
                """DELETE FROM cms_project_workspace_data
                   WHERE project_id=%s AND workspace_name='production' AND collection_id=%s""",
                (project_id, collection_id),
            )
            for r in rows:
                cursor.execute(
                    """INSERT INTO cms_project_workspace_data
                       (project_id, workspace_name, collection_id, document_id, data)
                       VALUES (%s, 'production', %s, %s, %s)""",
                    (project_id, collection_id, r["document_id"], psycopg2.extras.Json(r["data"])),
                )
        cursor.close()

    def push_document_to_production(
        self, project_id: str, source_workspace: str, collection_id: str, document_id: str
    ) -> bool:
        cursor = self.get_cursor()
        found = True
        with self.transaction():
            cursor.execute(
                """SELECT data FROM cms_project_workspace_data
                   WHERE project_id=%s AND workspace_name=%s AND collection_id=%s AND document_id=%s""",
                (project_id, source_workspace, collection_id, document_id),
            )
            row = cursor.fetchone()
            if not row:
                found = False
            else:
                cursor.execute(
                    """INSERT INTO cms_project_workspace_data
                       (project_id, workspace_name, collection_id, document_id, data)
                       VALUES (%s, 'production', %s, %s, %s)
                       ON CONFLICT(project_id, workspace_name, collection_id, document_id)
                       DO UPDATE SET data=excluded.data""",
                    (project_id, collection_id, document_id, psycopg2.extras.Json(row["data"])),
                )

                # Register the doc in production's meta for this collection
                cursor.execute(
                    """SELECT data FROM cms_project_workspace_data
                       WHERE project_id=%s AND workspace_name='production' AND collection_id=%s AND document_id='_meta_data'""",
                    (project_id, collection_id),
                )
                meta_row = cursor.fetchone()
                meta = meta_row["data"] if meta_row else {}
                sequence = meta.get("_document_sequence", [])
                if document_id not in sequence:
                    sequence.append(document_id)
                statuses = meta.get("_document_statuses", {})
                statuses[document_id] = row["data"].get("_status", "draft")
                new_meta = {**meta, "_document_sequence": sequence, "_document_statuses": statuses}
                cursor.execute(
                    """INSERT INTO cms_project_workspace_data
                       (project_id, workspace_name, collection_id, document_id, data)
                       VALUES (%s, 'production', %s, '_meta_data', %s)
                       ON CONFLICT(project_id, workspace_name, collection_id, document_id)
                       DO UPDATE SET data=excluded.data""",
                    (project_id, collection_id, psycopg2.extras.Json(new_meta)),
                )
        cursor.close()
        return found

    def pull_from_production(
        self,
        project_id: str,
        workspace_name: str,
        resolutions: dict,
        collection_id: str | None = None,
        document_id: str | None = None,
    ) -> None:
        source_docs = self.fetch_all_workspace_documents(project_id, workspace_name)
        target_docs = self.fetch_all_workspace_documents(project_id, "production")
        diff = diff_workspaces(source_docs, target_docs)

        # Scope the diff down when pulling a single collection or document
        if collection_id is not None:
            diff = {collection_id: diff[collection_id]} if collection_id in diff else {}
        if document_id is not None:
            diff = {
                col: {
                    bucket: [e for e in entries if e["document_id"] == document_id]
                    for bucket, entries in buckets.items()
                }
                for col, buckets in diff.items()
            }

        cursor = self.get_cursor()
        touched_collections: set[str] = set()
        new_ids_by_collection: dict[str, list[str]] = {}
        status_by_key: dict[tuple, str] = {}

        def apply_doc(collection_id: str, document_id: str, data: dict):
            cursor.execute(
                """INSERT INTO cms_project_workspace_data
                   (project_id, workspace_name, collection_id, document_id, data)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT(project_id, workspace_name, collection_id, document_id)
                   DO UPDATE SET data=excluded.data""",
                (project_id, workspace_name, collection_id, document_id, psycopg2.extras.Json(data)),
            )
            touched_collections.add(collection_id)
            status_by_key[(collection_id, document_id)] = data.get("_status", "draft")

        with self.transaction():
            for collection_id, buckets in diff.items():
                for entry in buckets["target_only"]:
                    apply_doc(collection_id, entry["document_id"], entry["data"])
                    new_ids_by_collection.setdefault(collection_id, []).append(entry["document_id"])

                for entry in buckets["modified"]:
                    key = f"{collection_id}:{entry['document_id']}"
                    if resolutions.get(key) == "production":
                        apply_doc(collection_id, entry["document_id"], entry["target_data"])

            for collection_id in touched_collections:
                cursor.execute(
                    """SELECT data FROM cms_project_workspace_data
                       WHERE project_id=%s AND workspace_name=%s AND collection_id=%s AND document_id='_meta_data'""",
                    (project_id, workspace_name, collection_id),
                )
                row = cursor.fetchone()
                meta = row["data"] if row else {}
                sequence = meta.get("_document_sequence", [])
                for new_id in new_ids_by_collection.get(collection_id, []):
                    if new_id not in sequence:
                        sequence.append(new_id)
                statuses = meta.get("_document_statuses", {})
                for (col, doc_id), status in status_by_key.items():
                    if col == collection_id:
                        statuses[doc_id] = status
                new_meta = {**meta, "_document_sequence": sequence, "_document_statuses": statuses}
                cursor.execute(
                    """INSERT INTO cms_project_workspace_data
                       (project_id, workspace_name, collection_id, document_id, data)
                       VALUES (%s, %s, %s, '_meta_data', %s)
                       ON CONFLICT(project_id, workspace_name, collection_id, document_id)
                       DO UPDATE SET data=excluded.data""",
                    (project_id, workspace_name, collection_id, psycopg2.extras.Json(new_meta)),
                )
        cursor.close()

    # ── Schema field CRUD ────────────────────────────────────────────────────

    def upsert_schema_field(self, project_id: str, field_id: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_project_schema (project_id, id, data) VALUES (%s, %s, %s)"
            " ON CONFLICT(project_id, id) DO UPDATE SET data=excluded.data",
            (project_id, field_id, psycopg2.extras.Json(data)),
        )
        self.connection.commit()
        cursor.close()
        cache = self._get_cache(project_id)
        cache["schema"][field_id] = data

    def delete_schema_field(self, project_id: str, field_id: str) -> tuple[list, str | None]:
        cache = self._get_cache(project_id)
        shifted_ids, removed_name = reindex_schema_after_delete(cache["schema"], field_id)

        cursor = self.get_cursor()
        with self.transaction():
            cursor.execute(
                "DELETE FROM cms_project_schema WHERE project_id=%s AND id=%s", (project_id, field_id)
            )
            for sid in shifted_ids:
                cursor.execute(
                    "INSERT INTO cms_project_schema (project_id, id, data) VALUES (%s, %s, %s)"
                    " ON CONFLICT(project_id, id) DO UPDATE SET data=excluded.data",
                    (project_id, sid, psycopg2.extras.Json(cache["schema"][sid])),
                )
        cursor.close()
        return shifted_ids, removed_name

    # ── Collection CRUD ──────────────────────────────────────────────────────

    def upsert_collection(self, project_id: str, collection_id: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_project_collections (project_id, id, data) VALUES (%s, %s, %s)"
            " ON CONFLICT(project_id, id) DO UPDATE SET data=excluded.data",
            (project_id, collection_id, psycopg2.extras.Json(data)),
        )
        self.connection.commit()
        cursor.close()
        cache = self._get_cache(project_id)
        cache["schema_collections"][collection_id] = data

    def delete_collection_record(self, project_id: str, collection_id: str):
        cursor = self.get_cursor()
        cursor.execute(
            "DELETE FROM cms_project_collections WHERE project_id=%s AND id=%s",
            (project_id, collection_id),
        )
        self.connection.commit()
        cursor.close()
        cache = self._get_cache(project_id)
        cache["schema_collections"].pop(collection_id, None)

    # ── Document CRUD ────────────────────────────────────────────────────────

    async def fetch_document(
        self, project_id: str, workspace_name: str, collection_id: str, document_id: str
    ):
        cursor = self.get_cursor()
        cursor.execute(
            """SELECT data FROM cms_project_workspace_data
               WHERE project_id=%s AND workspace_name=%s AND collection_id=%s AND document_id=%s""",
            (project_id, workspace_name, collection_id, document_id),
        )
        row = cursor.fetchone()
        cursor.close()
        return row["data"] if row else None

    def upsert_document(
        self,
        project_id: str,
        workspace_name: str,
        collection_id: str,
        document_id: str,
        data: dict,
    ):
        cursor = self.get_cursor()
        cursor.execute(
            """INSERT INTO cms_project_workspace_data
               (project_id, workspace_name, collection_id, document_id, data)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT(project_id, workspace_name, collection_id, document_id)
               DO UPDATE SET data=excluded.data""",
            (project_id, workspace_name, collection_id, document_id, psycopg2.extras.Json(data)),
        )
        self.connection.commit()
        cursor.close()

    def delete_document(
        self, project_id: str, workspace_name: str, collection_id: str, document_id: str
    ):
        cursor = self.get_cursor()
        cursor.execute(
            """DELETE FROM cms_project_workspace_data
               WHERE project_id=%s AND workspace_name=%s AND collection_id=%s AND document_id=%s""",
            (project_id, workspace_name, collection_id, document_id),
        )
        self.connection.commit()
        cursor.close()

    def delete_collection_workspace_docs(
        self, project_id: str, workspace_name: str, collection_id: str
    ):
        cursor = self.get_cursor()
        cursor.execute(
            """DELETE FROM cms_project_workspace_data
               WHERE project_id=%s AND workspace_name=%s AND collection_id=%s""",
            (project_id, workspace_name, collection_id),
        )
        self.connection.commit()
        cursor.close()

    # ── Schema category CRUD ─────────────────────────────────────────────────

    def get_categories(self, project_id: str) -> dict:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT id, data FROM cms_schema_categories WHERE project_id=%s", (project_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        return {row["id"]: row["data"] for row in rows}

    def upsert_category(self, project_id: str, cat_id: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_schema_categories (project_id, id, data) VALUES (%s, %s, %s)"
            " ON CONFLICT(project_id, id) DO UPDATE SET data=excluded.data",
            (project_id, cat_id, psycopg2.extras.Json(data)),
        )
        self.connection.commit()
        cursor.close()

    def delete_category(self, project_id: str, cat_id: str):
        cursor = self.get_cursor()
        with self.transaction():
            cursor.execute(
                "DELETE FROM cms_schema_categories WHERE project_id=%s AND id=%s",
                (project_id, cat_id),
            )
            cursor.execute(
                "UPDATE cms_schema_category_map SET category_id='' WHERE project_id=%s AND category_id=%s",
                (project_id, cat_id),
            )
        cursor.close()

    def get_category_map(self, project_id: str) -> dict:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT schema_name, category_id FROM cms_schema_category_map WHERE project_id=%s",
            (project_id,),
        )
        rows = cursor.fetchall()
        cursor.close()
        return {row["schema_name"]: row["category_id"] for row in rows}

    # ── Rich text wrapper component CRUD ─────────────────────────────────────

    def get_rich_text_components(self, project_id: str) -> dict:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT id, data FROM cms_rich_text_components WHERE project_id=%s", (project_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        return {row["id"]: row["data"] for row in rows}

    def upsert_rich_text_component(self, project_id: str, component_id: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_rich_text_components (project_id, id, data) VALUES (%s, %s, %s)"
            " ON CONFLICT(project_id, id) DO UPDATE SET data=excluded.data",
            (project_id, component_id, psycopg2.extras.Json(data)),
        )
        self.connection.commit()
        cursor.close()

    def delete_rich_text_component(self, project_id: str, component_id: str):
        cursor = self.get_cursor()
        cursor.execute(
            "DELETE FROM cms_rich_text_components WHERE project_id=%s AND id=%s",
            (project_id, component_id),
        )
        self.connection.commit()
        cursor.close()

    # ── Document versions ────────────────────────────────────────────────────

    def save_document_version(
        self,
        project_id: str,
        workspace_name: str,
        collection_id: str,
        document_id: str,
        data: dict,
        created_by_id: str = "",
        created_by_email: str = "",
    ):
        cursor = self.get_cursor()
        with self.transaction():
            cursor.execute(
                """SELECT COALESCE(MAX(version_number), 0) AS max_version FROM cms_document_versions
                   WHERE project_id=%s AND workspace_name=%s AND collection_id=%s AND document_id=%s""",
                (project_id, workspace_name, collection_id, document_id),
            )
            next_version = cursor.fetchone()["max_version"] + 1
            version_id = str(uuid.uuid4().hex)
            created_at = datetime.now(tz=UTC)
            cursor.execute(
                """INSERT INTO cms_document_versions
                   (id, project_id, workspace_name, collection_id, document_id,
                    version_number, data, created_at, created_by_id, created_by_email)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    version_id,
                    project_id,
                    workspace_name,
                    collection_id,
                    document_id,
                    next_version,
                    psycopg2.extras.Json(data),
                    created_at,
                    created_by_id,
                    created_by_email,
                ),
            )
            # Keep only the latest 50 versions per document
            cursor.execute(
                """DELETE FROM cms_document_versions WHERE project_id=%s AND workspace_name=%s
                   AND collection_id=%s AND document_id=%s
                   AND id NOT IN (
                       SELECT id FROM cms_document_versions
                       WHERE project_id=%s AND workspace_name=%s AND collection_id=%s AND document_id=%s
                       ORDER BY version_number DESC LIMIT 50
                   )""",
                (
                    project_id,
                    workspace_name,
                    collection_id,
                    document_id,
                    project_id,
                    workspace_name,
                    collection_id,
                    document_id,
                ),
            )
        cursor.close()

    def get_document_versions(
        self, project_id: str, workspace_name: str, collection_id: str, document_id: str
    ) -> list:
        cursor = self.get_cursor()
        cursor.execute(
            """SELECT id, version_number, created_at, created_by_id, created_by_email
               FROM cms_document_versions
               WHERE project_id=%s AND workspace_name=%s AND collection_id=%s AND document_id=%s
               ORDER BY version_number DESC""",
            (project_id, workspace_name, collection_id, document_id),
        )
        rows = cursor.fetchall()
        cursor.close()
        return [
            {
                "id": r["id"],
                "version_number": r["version_number"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "created_by_id": r["created_by_id"],
                "created_by_email": r["created_by_email"],
            }
            for r in rows
        ]

    def get_document_version(self, version_id: str) -> dict | None:
        cursor = self.get_cursor()
        cursor.execute("SELECT * FROM cms_document_versions WHERE id=%s", (version_id,))
        r = cursor.fetchone()
        cursor.close()
        if not r:
            return None
        return {
            "id": r["id"],
            "version_number": r["version_number"],
            "data": r["data"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "created_by_id": r["created_by_id"],
            "created_by_email": r["created_by_email"],
        }

    # ── Schema category CRUD ─────────────────────────────────────────────────

    def set_schema_category(self, project_id: str, schema_name: str, category_id: str):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_schema_category_map (project_id, schema_name, category_id) VALUES (%s, %s, %s)"
            " ON CONFLICT(project_id, schema_name) DO UPDATE SET category_id=excluded.category_id",
            (project_id, schema_name, category_id),
        )
        self.connection.commit()
        cursor.close()

    # ── Realtime Database (per-project JSON tree) ────────────────────────────

    def get_rtdb(self, project_id: str) -> dict:
        cursor = self.get_cursor()
        cursor.execute("SELECT data FROM cms_project_rtdb WHERE project_id=%s", (project_id,))
        row = cursor.fetchone()
        cursor.close()
        return row["data"] if row else {}

    def _save_rtdb(self, project_id: str, tree: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_project_rtdb (project_id, data) VALUES (%s, %s)"
            " ON CONFLICT(project_id) DO UPDATE SET data=excluded.data",
            (project_id, psycopg2.extras.Json(tree)),
        )
        self.connection.commit()
        cursor.close()

    @staticmethod
    def _rtdb_segments(path: str) -> list[str]:
        return [seg for seg in path.split("/") if seg]

    @staticmethod
    def _rtdb_get_child(node, seg: str):
        """Reads `seg` off a dict (by key) or list (by numeric index); None if absent."""
        if isinstance(node, dict):
            return node.get(seg)
        if isinstance(node, list):
            return node[int(seg)] if seg.isdigit() and int(seg) < len(node) else None
        return None

    @staticmethod
    def _rtdb_set_child(node, seg: str, value):
        """Writes `seg` into a dict (by key) or list (by index; appends when seg == len(node))."""
        if isinstance(node, list):
            idx = int(seg) if seg.isdigit() else len(node)
            if idx < len(node):
                node[idx] = value
            else:
                node.extend([None] * (idx - len(node)))
                node.append(value)
        else:
            node[seg] = value

    def get_rtdb_path(self, project_id: str, path: str):
        node = self.get_rtdb(project_id)
        for seg in self._rtdb_segments(path):
            node = self._rtdb_get_child(node, seg)
            if node is None:
                return None
        return node

    def set_rtdb_path(self, project_id: str, path: str, value):
        segments = self._rtdb_segments(path)
        if not segments:
            tree = value if isinstance(value, dict) else {}
        else:
            tree = self.get_rtdb(project_id)
            node = tree
            for seg in segments[:-1]:
                nxt = self._rtdb_get_child(node, seg)
                if not isinstance(nxt, (dict, list)):
                    nxt = {}
                    self._rtdb_set_child(node, seg, nxt)
                node = nxt
            self._rtdb_set_child(node, segments[-1], value)
        self._save_rtdb(project_id, tree)

    def update_rtdb_path(self, project_id: str, path: str, value: dict):
        segments = self._rtdb_segments(path)
        tree = self.get_rtdb(project_id)
        node = tree
        for seg in segments:
            nxt = self._rtdb_get_child(node, seg)
            if not isinstance(nxt, (dict, list)):
                nxt = {}
                self._rtdb_set_child(node, seg, nxt)
            node = nxt
        if isinstance(node, dict):
            node.update(value)
        self._save_rtdb(project_id, tree)

    def delete_rtdb_path(self, project_id: str, path: str):
        segments = self._rtdb_segments(path)
        tree = self.get_rtdb(project_id)
        if not segments:
            self._save_rtdb(project_id, {})
            return
        node = tree
        for seg in segments[:-1]:
            nxt = self._rtdb_get_child(node, seg)
            if nxt is None:
                return
            node = nxt
        last = segments[-1]
        if isinstance(node, list):
            if last.isdigit() and int(last) < len(node):
                node.pop(int(last))
        elif isinstance(node, dict):
            node.pop(last, None)
        self._save_rtdb(project_id, tree)
