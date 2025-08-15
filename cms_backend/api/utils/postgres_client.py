import uuid
import json
import jwt
import psycopg2
import psycopg2.extras
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from decouple import config
from datetime import datetime, timedelta, timezone
from api.utils.schema import Schema


class PostgresClient:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(PostgresClient, cls).__new__(cls, *args, **kwargs)
            cls._instance.connection = cls._create_connection()
        return cls._instance

    @staticmethod
    def _create_connection():
        return psycopg2.connect(
            host=config('DB_HOST', default='localhost'),
            port=config('DB_PORT', default='5432'),
            dbname=config('DB_NAME'),
            user=config('DB_USER'),
            password=config('DB_PASSWORD'),
        )

    def get_cursor(self):
        try:
            self.connection.cursor().close()
        except psycopg2.InterfaceError:
            self.connection = self._create_connection()
        return self.connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


class PostgresAuth(PostgresClient):
    def __init__(self):
        super().__init__()

    def create_user(self, email: str, password: str):
        user = User.objects.create_user(username=email, email=email, password=password)
        return str(user.id)

    def verify_id_token(self, id_token):
        secret = config('DJANGO_SECRET_KEY')
        try:
            payload = jwt.decode(id_token, secret, algorithms=['HS256'])
            return {
                'uid': payload['uid'],
                'email': payload['email'],
                'email_verified': payload.get('email_verified', True),
            }
        except jwt.ExpiredSignatureError:
            raise Exception("Token verification failed: Token has expired")
        except jwt.InvalidTokenError as e:
            raise Exception(f"Token verification failed: {str(e)}")

    def login_user(self, email: str, password: str):
        user = authenticate(username=email, password=password)
        if not user:
            raise Exception("Login failed: INVALID_CREDENTIALS")

        secret = config('DJANGO_SECRET_KEY')
        now = datetime.now(tz=timezone.utc)
        payload = {
            'uid': str(user.id),
            'email': user.email,
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
            'localId': str(user.id),
        }

    def get_admin_token_id(self):
        admin_email = config('ADMIN_EMAIL')
        admin_password = config('ADMIN_PASSWORD')
        return self.login_user(admin_email, admin_password).get('idToken')


class PostgresData(PostgresClient, Schema):
    def __init__(self):
        PostgresClient.__init__(self)
        self._ensure_tables()
        schema_data = self._fetch_all('cms_schema')
        schema_collections_data = self._fetch_all('cms_schema_collections')
        Schema.__init__(self, schema_data, schema_collections_data)

    def get_schema(self, raw_schema_data: list):
        return {row['id']: dict(row['data']) for row in raw_schema_data}

    def _ensure_tables(self):
        cursor = self.get_cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cms_schema (
                id VARCHAR(255) PRIMARY KEY,
                data JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cms_schema_collections (
                id VARCHAR(255) PRIMARY KEY,
                data JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cms_workspace_data (
                workspace_name VARCHAR(255) NOT NULL,
                collection_id VARCHAR(255) NOT NULL,
                document_id VARCHAR(255) NOT NULL,
                data JSONB NOT NULL,
                PRIMARY KEY (workspace_name, collection_id, document_id)
            );
            CREATE TABLE IF NOT EXISTS cms_realtime (
                path TEXT PRIMARY KEY,
                data JSONB NOT NULL
            );
        """)
        self.connection.commit()
        cursor.close()

    def _fetch_all(self, table):
        cursor = self.get_cursor()
        cursor.execute(f"SELECT id, data FROM {table}")
        rows = cursor.fetchall()
        cursor.close()
        return rows

    async def fetch_and_unpack(self, data):
        return data

    async def unpack_doc_ref(self, doc_data):
        return doc_data

    async def fetch_document_data(self, workspace_name, collection_id, document_id):
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT data FROM cms_workspace_data WHERE workspace_name=%s AND collection_id=%s AND document_id=%s",
            (workspace_name, collection_id, document_id)
        )
        row = cursor.fetchone()
        cursor.close()
        return dict(row['data']) if row else None

    def set_document_data(self, path, data):
        parts = path.strip('/').split('/')
        cursor = self.get_cursor()

        if parts[0] == '_schema' and len(parts) == 2:
            cursor.execute(
                """INSERT INTO cms_schema (id, data) VALUES (%s, %s)
                   ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data""",
                (parts[1], json.dumps(data))
            )
        elif parts[0] == '_schema_collections' and len(parts) == 2:
            cursor.execute(
                """INSERT INTO cms_schema_collections (id, data) VALUES (%s, %s)
                   ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data""",
                (parts[1], json.dumps(data))
            )
        elif parts[0] == '_workspace' and len(parts) == 4:
            workspace_name, collection_id, document_id = parts[1], parts[2], parts[3]
            cursor.execute(
                """INSERT INTO cms_workspace_data (workspace_name, collection_id, document_id, data)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (workspace_name, collection_id, document_id) DO UPDATE SET data = EXCLUDED.data""",
                (workspace_name, collection_id, document_id, json.dumps(data))
            )

        self.connection.commit()
        cursor.close()

    def delete_document_data(self, path):
        parts = path.strip('/').split('/')
        cursor = self.get_cursor()

        if parts[0] == '_schema' and len(parts) == 2:
            cursor.execute("DELETE FROM cms_schema WHERE id=%s", (parts[1],))
        elif parts[0] == '_schema_collections' and len(parts) == 2:
            cursor.execute("DELETE FROM cms_schema_collections WHERE id=%s", (parts[1],))
        elif parts[0] == '_workspace' and len(parts) == 4:
            workspace_name, collection_id, document_id = parts[1], parts[2], parts[3]
            cursor.execute(
                "DELETE FROM cms_workspace_data WHERE workspace_name=%s AND collection_id=%s AND document_id=%s",
                (workspace_name, collection_id, document_id)
            )

        self.connection.commit()
        cursor.close()

    def delete_collection_data(self, path):
        parts = path.strip('/').split('/')
        if parts[0] != '_workspace' or len(parts) != 3:
            return
        workspace_name, collection_id = parts[1], parts[2]
        cursor = self.get_cursor()
        cursor.execute(
            "DELETE FROM cms_workspace_data WHERE workspace_name=%s AND collection_id=%s",
            (workspace_name, collection_id)
        )
        self.connection.commit()
        cursor.close()

    @staticmethod
    def get_realtime_content(path):
        client = PostgresClient()
        cursor = client.get_cursor()
        cursor.execute("SELECT data FROM cms_realtime WHERE path=%s", (path,))
        row = cursor.fetchone()
        cursor.close()
        return row['data'] if row else None

    @staticmethod
    def set_realtime_content(path, value):
        client = PostgresClient()
        cursor = client.get_cursor()
        cursor.execute(
            """INSERT INTO cms_realtime (path, data) VALUES (%s, %s)
               ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data""",
            (path, json.dumps(value))
        )
        client.connection.commit()
        cursor.close()

    @staticmethod
    def delete_realtime_content(path):
        client = PostgresClient()
        cursor = client.get_cursor()
        cursor.execute("DELETE FROM cms_realtime WHERE path=%s", (path,))
        client.connection.commit()
        cursor.close()
