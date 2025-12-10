import uuid
import json
import jwt
import hashlib
import os
import sqlite3
import threading
from decouple import config
from datetime import datetime, timedelta, timezone
from api.utils.schema import reindex_schema_after_delete


class SqliteClient:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(SqliteClient, cls).__new__(cls, *args, **kwargs)
            cls._instance._local = threading.local()
        return cls._instance

    @staticmethod
    def _create_connection():
        db_path = config('SQLITE_DB_PATH', default='db.sqlite3')
        conn = sqlite3.connect(db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @property
    def connection(self):
        local = self._local
        if not hasattr(local, 'conn') or local.conn is None:
            local.conn = self._create_connection()
        return local.conn

    @connection.setter
    def connection(self, value):
        self._local.conn = value

    def get_cursor(self):
        try:
            self.connection.execute('SELECT 1')
        except (sqlite3.ProgrammingError, sqlite3.InterfaceError):
            self.connection = self._create_connection()
        return self.connection.cursor()


class SqliteAuth(SqliteClient):
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
                role TEXT DEFAULT 'Member'
            );
        """)
        for col in ('api_key TEXT', 'display_name TEXT', 'first_name TEXT', 'last_name TEXT', "role TEXT DEFAULT 'Member'"):
            try:
                cursor.execute(f"ALTER TABLE cms_users ADD COLUMN {col}")
            except sqlite3.OperationalError:
                pass
        self.connection.commit()
        cursor.close()

    @staticmethod
    def _hash_password(password: str) -> str:
        salt = os.urandom(16).hex()
        dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return f"pbkdf2:{salt}:{dk.hex()}"

    @staticmethod
    def _verify_password(password: str, hashed: str) -> bool:
        try:
            _, salt, dk_hex = hashed.split(':')
            dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
            return dk.hex() == dk_hex
        except Exception:
            return False

    def create_user(self, email: str, password: str, role: str = 'Member', first_name: str = '', last_name: str = ''):
        user_id = str(uuid.uuid4().hex)
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_users (id, email, password, role, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, email, self._hash_password(password), role, first_name, last_name)
        )
        self.connection.commit()
        cursor.close()
        return user_id

    def verify_id_token(self, id_token):
        secret = config('DJANGO_SECRET_KEY')
        try:
            payload = jwt.decode(id_token, secret, algorithms=['HS256'])
            cursor = self.get_cursor()
            cursor.execute("SELECT first_name, last_name, role FROM cms_users WHERE id=?", (payload['uid'],))
            row = cursor.fetchone()
            cursor.close()
            return {
                'uid': payload['uid'],
                'email': payload['email'],
                'email_verified': payload.get('email_verified', True),
                'first_name': row['first_name'] if row else '',
                'last_name': row['last_name'] if row else '',
                'role': row['role'] if row and row['role'] else 'Member',
            }
        except jwt.ExpiredSignatureError:
            raise Exception("Token verification failed: Token has expired")
        except jwt.InvalidTokenError as e:
            raise Exception(f"Token verification failed: {str(e)}")

    def login_user(self, email: str, password: str):
        cursor = self.get_cursor()
        cursor.execute("SELECT id, email, password FROM cms_users WHERE email=?", (email,))
        row = cursor.fetchone()
        cursor.close()

        if not row or not self._verify_password(password, row['password']):
            raise Exception("Login failed: INVALID_CREDENTIALS")

        secret = config('DJANGO_SECRET_KEY')
        now = datetime.now(tz=timezone.utc)
        payload = {
            'uid': str(row['id']),
            'email': row['email'],
            'email_verified': True,
            'exp': now + timedelta(hours=1),
            'iat': now,
        }
        id_token = jwt.encode(payload, secret, algorithm='HS256')
        refresh_payload = {**payload, 'exp': now + timedelta(days=30)}
        refresh_token = jwt.encode(refresh_payload, secret, algorithm='HS256')

        return {
            'idToken': id_token,
            'refreshToken': refresh_token,
            'localId': str(row['id']),
        }

    def refresh_tokens(self, uid: str, email: str):
        secret = config('DJANGO_SECRET_KEY')
        now = datetime.now(tz=timezone.utc)
        payload = {
            'uid': uid,
            'email': email,
            'email_verified': True,
            'exp': now + timedelta(hours=1),
            'iat': now,
        }
        id_token = jwt.encode(payload, secret, algorithm='HS256')
        refresh_payload = {**payload, 'exp': now + timedelta(days=30)}
        refresh_token = jwt.encode(refresh_payload, secret, algorithm='HS256')
        return {'idToken': id_token, 'refreshToken': refresh_token}

    def list_users(self) -> list:
        cursor = self.get_cursor()
        cursor.execute("SELECT id, email, first_name, last_name, role FROM cms_users ORDER BY rowid")
        rows = cursor.fetchall()
        cursor.close()
        return [{'uid': r['id'], 'email': r['email'], 'first_name': r['first_name'] or '', 'last_name': r['last_name'] or '', 'role': r['role'] or 'Member'} for r in rows]

    def delete_user(self, uid: str):
        cursor = self.get_cursor()
        cursor.execute("DELETE FROM cms_users WHERE id=?", (uid,))
        self.connection.commit()
        cursor.close()

    def change_password(self, uid: str, current_password: str, new_password: str):
        cursor = self.get_cursor()
        cursor.execute("SELECT password FROM cms_users WHERE id=?", (uid,))
        row = cursor.fetchone()
        cursor.close()
        if not row or not self._verify_password(current_password, row['password']):
            raise Exception("Current password is incorrect")
        cursor = self.get_cursor()
        cursor.execute("UPDATE cms_users SET password=? WHERE id=?", (self._hash_password(new_password), uid))
        self.connection.commit()
        cursor.close()

    def update_name(self, uid: str, first_name: str, last_name: str):
        cursor = self.get_cursor()
        cursor.execute("UPDATE cms_users SET first_name=?, last_name=? WHERE id=?", (first_name, last_name, uid))
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
                created_at TEXT NOT NULL
            );
        """)
        self.connection.commit()
        cursor.close()

    def list_api_keys(self) -> list:
        cursor = self.get_cursor()
        cursor.execute("SELECT id, label, key, created_by, created_at FROM cms_api_keys ORDER BY created_at DESC")
        rows = cursor.fetchall()
        cursor.close()
        return [{'id': r['id'], 'label': r['label'], 'key': r['key'], 'created_by': r['created_by'], 'created_at': r['created_at']} for r in rows]

    def create_api_key(self, label: str, created_by: str) -> dict:
        import secrets
        key_id = str(uuid.uuid4().hex)
        key = secrets.token_urlsafe(32)
        created_at = datetime.now(tz=timezone.utc).isoformat()
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_api_keys (id, label, key, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
            (key_id, label, key, created_by, created_at)
        )
        self.connection.commit()
        cursor.close()
        return {'id': key_id, 'label': label, 'key': key, 'created_by': created_by, 'created_at': created_at}

    def delete_api_key(self, key_id: str):
        cursor = self.get_cursor()
        cursor.execute("DELETE FROM cms_api_keys WHERE id=?", (key_id,))
        self.connection.commit()
        cursor.close()

    def generate_api_key(self, uid: str) -> str:
        import secrets
        api_key = secrets.token_urlsafe(32)
        cursor = self.get_cursor()
        cursor.execute("UPDATE cms_users SET api_key=? WHERE id=?", (api_key, uid))
        self.connection.commit()
        cursor.close()
        return api_key

    def get_api_key(self, uid: str) -> str | None:
        cursor = self.get_cursor()
        cursor.execute("SELECT api_key FROM cms_users WHERE id=?", (uid,))
        row = cursor.fetchone()
        cursor.close()
        return row['api_key'] if row else None

    def owner_exists(self) -> bool:
        cursor = self.get_cursor()
        cursor.execute("SELECT COUNT(*) FROM cms_users")
        count = cursor.fetchone()[0]
        cursor.close()
        return count > 0

    def get_admin_token_id(self):
        cursor = self.get_cursor()
        cursor.execute("SELECT id, email FROM cms_users ORDER BY rowid LIMIT 1")
        row = cursor.fetchone()
        cursor.close()
        if not row:
            raise Exception("No users exist. Please sign up first.")
        secret = config('DJANGO_SECRET_KEY')
        from datetime import datetime, timedelta, timezone
        import jwt as pyjwt
        now = datetime.now(tz=timezone.utc)
        payload = {
            'uid': row['id'],
            'email': row['email'],
            'email_verified': True,
            'exp': now + timedelta(hours=1),
            'iat': now,
        }
        return pyjwt.encode(payload, secret, algorithm='HS256')


class SqliteData(SqliteClient):
    def __init__(self):
        if not hasattr(self, '_caches'):
            self._caches: dict[str, dict] = {}
        self._ensure_tables()
        self._ensure_versions_table()

    def _ensure_tables(self):
        cursor = self.get_cursor()
        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS cms_projects (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cms_workspaces (
                project_id TEXT NOT NULL,
                workspace_name TEXT NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (project_id, workspace_name)
            );
            CREATE TABLE IF NOT EXISTS cms_project_schema (
                project_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (project_id, id)
            );
            CREATE TABLE IF NOT EXISTS cms_project_collections (
                project_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (project_id, id)
            );
            CREATE TABLE IF NOT EXISTS cms_project_workspace_data (
                project_id TEXT NOT NULL,
                workspace_name TEXT NOT NULL,
                collection_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (project_id, workspace_name, collection_id, document_id)
            );
            CREATE TABLE IF NOT EXISTS cms_schema_categories (
                project_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (project_id, id)
            );
            CREATE TABLE IF NOT EXISTS cms_schema_category_map (
                project_id TEXT NOT NULL,
                schema_name TEXT NOT NULL,
                category_id TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (project_id, schema_name)
            );
        """)
        self.connection.commit()
        cursor.close()

    def _ensure_versions_table(self):
        cursor = self.get_cursor()
        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS cms_document_versions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                workspace_name TEXT NOT NULL,
                collection_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL,
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
        cursor.execute(
            "SELECT id, data FROM cms_project_schema WHERE project_id=?", (project_id,)
        )
        schema = {row['id']: json.loads(row['data']) for row in cursor.fetchall()}

        cursor.execute(
            "SELECT id, data FROM cms_project_collections WHERE project_id=?", (project_id,)
        )
        collections = {row['id']: json.loads(row['data']) for row in cursor.fetchall()}
        cursor.close()

        self._caches[project_id] = {'schema': schema, 'schema_collections': collections}

    def _get_cache(self, project_id: str) -> dict:
        if project_id not in self._caches:
            self._load_cache(project_id)
        return self._caches[project_id]

    def _invalidate_cache(self, project_id: str):
        self._caches.pop(project_id, None)

    def get_schema(self, project_id: str) -> dict:
        return self._get_cache(project_id)['schema']

    def get_collections(self, project_id: str) -> dict:
        return self._get_cache(project_id)['schema_collections']

    # ── Project CRUD ─────────────────────────────────────────────────────────

    def fetch_all_projects(self) -> list:
        cursor = self.get_cursor()
        cursor.execute("SELECT id, data FROM cms_projects ORDER BY rowid ASC")
        rows = cursor.fetchall()
        cursor.close()
        return [{'_id': row['id'], **json.loads(row['data'])} for row in rows]

    def get_project(self, project_id: str) -> dict | None:
        cursor = self.get_cursor()
        cursor.execute("SELECT id, data FROM cms_projects WHERE id=?", (project_id,))
        row = cursor.fetchone()
        cursor.close()
        return {'_id': row['id'], **json.loads(row['data'])} if row else None

    def upsert_project(self, project_id: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_projects (id, data) VALUES (?, ?)"
            " ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            (project_id, json.dumps(data))
        )
        self.connection.commit()
        cursor.close()

    def delete_project_record(self, project_id: str):
        cursor = self.get_cursor()
        cursor.execute("DELETE FROM cms_projects WHERE id=?", (project_id,))
        cursor.execute("DELETE FROM cms_workspaces WHERE project_id=?", (project_id,))
        cursor.execute("DELETE FROM cms_project_schema WHERE project_id=?", (project_id,))
        cursor.execute("DELETE FROM cms_project_collections WHERE project_id=?", (project_id,))
        cursor.execute(
            "DELETE FROM cms_project_workspace_data WHERE project_id=?", (project_id,)
        )
        self.connection.commit()
        cursor.close()
        self._invalidate_cache(project_id)

    # ── Workspace CRUD ───────────────────────────────────────────────────────

    def fetch_workspaces(self, project_id: str) -> list:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT workspace_name, data FROM cms_workspaces WHERE project_id=? ORDER BY rowid ASC",
            (project_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        return [{'workspace_name': row['workspace_name'], **json.loads(row['data'])} for row in rows]

    def get_workspace(self, project_id: str, workspace_name: str) -> dict | None:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT workspace_name, data FROM cms_workspaces WHERE project_id=? AND workspace_name=?",
            (project_id, workspace_name)
        )
        row = cursor.fetchone()
        cursor.close()
        return {'workspace_name': row['workspace_name'], **json.loads(row['data'])} if row else None

    def upsert_workspace(self, project_id: str, workspace_name: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_workspaces (project_id, workspace_name, data) VALUES (?, ?, ?)"
            " ON CONFLICT(project_id, workspace_name) DO UPDATE SET data=excluded.data",
            (project_id, workspace_name, json.dumps(data))
        )
        self.connection.commit()
        cursor.close()

    def delete_workspace_record(self, project_id: str, workspace_name: str):
        cursor = self.get_cursor()
        cursor.execute(
            "DELETE FROM cms_workspaces WHERE project_id=? AND workspace_name=?",
            (project_id, workspace_name)
        )
        cursor.execute(
            "DELETE FROM cms_project_workspace_data WHERE project_id=? AND workspace_name=?",
            (project_id, workspace_name)
        )
        self.connection.commit()
        cursor.close()

    def push_workspace_to_production(self, project_id: str, source_workspace: str):
        cursor = self.get_cursor()

        # Fetch all non-meta documents; only push published ones
        cursor.execute(
            """SELECT collection_id, document_id, data FROM cms_project_workspace_data
               WHERE project_id=? AND workspace_name=? AND document_id != '_meta_data'""",
            (project_id, source_workspace),
        )
        doc_rows = cursor.fetchall()

        # Fetch meta documents to carry sequence/status over
        cursor.execute(
            """SELECT collection_id, data FROM cms_project_workspace_data
               WHERE project_id=? AND workspace_name=? AND document_id='_meta_data'""",
            (project_id, source_workspace),
        )
        meta_rows = cursor.fetchall()

        # Build per-collection set of published doc IDs (preserving order)
        published_by_col: dict[str, list] = {}
        published_docs: list[tuple] = []
        for r in doc_rows:
            d = json.loads(r['data'])
            if d.get('_status', 'draft') == 'published':
                col = r['collection_id']
                published_by_col.setdefault(col, []).append(r['document_id'])
                published_docs.append((r['collection_id'], r['document_id'], r['data']))

        # Clear production
        cursor.execute(
            "DELETE FROM cms_project_workspace_data WHERE project_id=? AND workspace_name='production'",
            (project_id,),
        )

        # Insert published documents
        for collection_id, document_id, data in published_docs:
            cursor.execute(
                """INSERT INTO cms_project_workspace_data
                   (project_id, workspace_name, collection_id, document_id, data)
                   VALUES (?, 'production', ?, ?, ?)""",
                (project_id, collection_id, document_id, data),
            )

        # Rebuild meta with filtered sequence + statuses
        for meta_row in meta_rows:
            col = meta_row['collection_id']
            meta = json.loads(meta_row['data'])
            pub_ids = set(published_by_col.get(col, []))
            orig_seq = meta.get('_document_sequence', [])
            filtered_seq = [i for i in orig_seq if i in pub_ids]
            statuses = meta.get('_document_statuses', {})
            filtered_statuses = {i: statuses.get(i, 'published') for i in filtered_seq}
            new_meta = {**meta, '_document_sequence': filtered_seq, '_document_statuses': filtered_statuses}
            cursor.execute(
                """INSERT INTO cms_project_workspace_data
                   (project_id, workspace_name, collection_id, document_id, data)
                   VALUES (?, 'production', ?, '_meta_data', ?)""",
                (project_id, col, json.dumps(new_meta)),
            )

        self.connection.commit()
        cursor.close()

    # ── Schema field CRUD ────────────────────────────────────────────────────

    def upsert_schema_field(self, project_id: str, field_id: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_project_schema (project_id, id, data) VALUES (?, ?, ?)"
            " ON CONFLICT(project_id, id) DO UPDATE SET data=excluded.data",
            (project_id, field_id, json.dumps(data))
        )
        self.connection.commit()
        cursor.close()
        cache = self._get_cache(project_id)
        cache['schema'][field_id] = data

    def delete_schema_field(self, project_id: str, field_id: str) -> tuple[list, str | None]:
        cache = self._get_cache(project_id)
        shifted_ids, removed_name = reindex_schema_after_delete(cache['schema'], field_id)

        cursor = self.get_cursor()
        cursor.execute(
            "DELETE FROM cms_project_schema WHERE project_id=? AND id=?",
            (project_id, field_id)
        )
        for sid in shifted_ids:
            cursor.execute(
                "INSERT INTO cms_project_schema (project_id, id, data) VALUES (?, ?, ?)"
                " ON CONFLICT(project_id, id) DO UPDATE SET data=excluded.data",
                (project_id, sid, json.dumps(cache['schema'][sid]))
            )
        self.connection.commit()
        cursor.close()
        return shifted_ids, removed_name

    # ── Collection CRUD ──────────────────────────────────────────────────────

    def upsert_collection(self, project_id: str, collection_id: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_project_collections (project_id, id, data) VALUES (?, ?, ?)"
            " ON CONFLICT(project_id, id) DO UPDATE SET data=excluded.data",
            (project_id, collection_id, json.dumps(data))
        )
        self.connection.commit()
        cursor.close()
        cache = self._get_cache(project_id)
        cache['schema_collections'][collection_id] = data

    def delete_collection_record(self, project_id: str, collection_id: str):
        cursor = self.get_cursor()
        cursor.execute(
            "DELETE FROM cms_project_collections WHERE project_id=? AND id=?",
            (project_id, collection_id)
        )
        self.connection.commit()
        cursor.close()
        cache = self._get_cache(project_id)
        cache['schema_collections'].pop(collection_id, None)

    # ── Document CRUD ────────────────────────────────────────────────────────

    async def fetch_document(
        self, project_id: str, workspace_name: str, collection_id: str, document_id: str
    ):
        cursor = self.get_cursor()
        cursor.execute(
            """SELECT data FROM cms_project_workspace_data
               WHERE project_id=? AND workspace_name=? AND collection_id=? AND document_id=?""",
            (project_id, workspace_name, collection_id, document_id)
        )
        row = cursor.fetchone()
        cursor.close()
        return json.loads(row['data']) if row else None

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
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(project_id, workspace_name, collection_id, document_id)
               DO UPDATE SET data=excluded.data""",
            (project_id, workspace_name, collection_id, document_id, json.dumps(data))
        )
        self.connection.commit()
        cursor.close()

    def delete_document(
        self, project_id: str, workspace_name: str, collection_id: str, document_id: str
    ):
        cursor = self.get_cursor()
        cursor.execute(
            """DELETE FROM cms_project_workspace_data
               WHERE project_id=? AND workspace_name=? AND collection_id=? AND document_id=?""",
            (project_id, workspace_name, collection_id, document_id)
        )
        self.connection.commit()
        cursor.close()

    def delete_collection_workspace_docs(
        self, project_id: str, workspace_name: str, collection_id: str
    ):
        cursor = self.get_cursor()
        cursor.execute(
            """DELETE FROM cms_project_workspace_data
               WHERE project_id=? AND workspace_name=? AND collection_id=?""",
            (project_id, workspace_name, collection_id)
        )
        self.connection.commit()
        cursor.close()

    # ── Schema category CRUD ─────────────────────────────────────────────────

    def get_categories(self, project_id: str) -> dict:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT id, data FROM cms_schema_categories WHERE project_id=?", (project_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        return {row['id']: json.loads(row['data']) for row in rows}

    def upsert_category(self, project_id: str, cat_id: str, data: dict):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_schema_categories (project_id, id, data) VALUES (?, ?, ?)"
            " ON CONFLICT(project_id, id) DO UPDATE SET data=excluded.data",
            (project_id, cat_id, json.dumps(data))
        )
        self.connection.commit()
        cursor.close()

    def delete_category(self, project_id: str, cat_id: str):
        cursor = self.get_cursor()
        cursor.execute(
            "DELETE FROM cms_schema_categories WHERE project_id=? AND id=?",
            (project_id, cat_id)
        )
        cursor.execute(
            "UPDATE cms_schema_category_map SET category_id='' WHERE project_id=? AND category_id=?",
            (project_id, cat_id)
        )
        self.connection.commit()
        cursor.close()

    def get_category_map(self, project_id: str) -> dict:
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT schema_name, category_id FROM cms_schema_category_map WHERE project_id=?",
            (project_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        return {row['schema_name']: row['category_id'] for row in rows}

    # ── Document versions ────────────────────────────────────────────────────

    def save_document_version(
        self, project_id: str, workspace_name: str, collection_id: str,
        document_id: str, data: dict, created_by_id: str = '', created_by_email: str = '',
    ):
        cursor = self.get_cursor()
        cursor.execute(
            """SELECT COALESCE(MAX(version_number), 0) FROM cms_document_versions
               WHERE project_id=? AND workspace_name=? AND collection_id=? AND document_id=?""",
            (project_id, workspace_name, collection_id, document_id),
        )
        next_version = cursor.fetchone()[0] + 1
        version_id = str(uuid.uuid4().hex)
        created_at = datetime.now(tz=timezone.utc).isoformat()
        cursor.execute(
            """INSERT INTO cms_document_versions
               (id, project_id, workspace_name, collection_id, document_id,
                version_number, data, created_at, created_by_id, created_by_email)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (version_id, project_id, workspace_name, collection_id, document_id,
             next_version, json.dumps(data), created_at, created_by_id, created_by_email),
        )
        # Keep only the latest 50 versions per document
        cursor.execute(
            """DELETE FROM cms_document_versions WHERE project_id=? AND workspace_name=?
               AND collection_id=? AND document_id=?
               AND id NOT IN (
                   SELECT id FROM cms_document_versions
                   WHERE project_id=? AND workspace_name=? AND collection_id=? AND document_id=?
                   ORDER BY version_number DESC LIMIT 50
               )""",
            (project_id, workspace_name, collection_id, document_id,
             project_id, workspace_name, collection_id, document_id),
        )
        self.connection.commit()
        cursor.close()

    def get_document_versions(
        self, project_id: str, workspace_name: str, collection_id: str, document_id: str
    ) -> list:
        cursor = self.get_cursor()
        cursor.execute(
            """SELECT id, version_number, created_at, created_by_id, created_by_email
               FROM cms_document_versions
               WHERE project_id=? AND workspace_name=? AND collection_id=? AND document_id=?
               ORDER BY version_number DESC""",
            (project_id, workspace_name, collection_id, document_id),
        )
        rows = cursor.fetchall()
        cursor.close()
        return [{'id': r['id'], 'version_number': r['version_number'], 'created_at': r['created_at'],
                 'created_by_id': r['created_by_id'], 'created_by_email': r['created_by_email']} for r in rows]

    def get_document_version(self, version_id: str) -> dict | None:
        cursor = self.get_cursor()
        cursor.execute("SELECT * FROM cms_document_versions WHERE id=?", (version_id,))
        r = cursor.fetchone()
        cursor.close()
        if not r:
            return None
        return {'id': r['id'], 'version_number': r['version_number'], 'data': json.loads(r['data']),
                'created_at': r['created_at'], 'created_by_id': r['created_by_id'],
                'created_by_email': r['created_by_email']}

    # ── Schema category CRUD ─────────────────────────────────────────────────

    def set_schema_category(self, project_id: str, schema_name: str, category_id: str):
        cursor = self.get_cursor()
        cursor.execute(
            "INSERT INTO cms_schema_category_map (project_id, schema_name, category_id) VALUES (?, ?, ?)"
            " ON CONFLICT(project_id, schema_name) DO UPDATE SET category_id=excluded.category_id",
            (project_id, schema_name, category_id)
        )
        self.connection.commit()
        cursor.close()
