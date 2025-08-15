import uuid
import json
import jwt
import sqlite3
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from decouple import config
from datetime import datetime, timedelta, timezone
from api.utils.schema import Schema


class SqliteClient:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(SqliteClient, cls).__new__(cls, *args, **kwargs)
            cls._instance.connection = cls._create_connection()
        return cls._instance

    @staticmethod
    def _create_connection():
        db_path = config('SQLITE_DB_PATH', default='db.sqlite3')
        conn = sqlite3.connect(db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def get_cursor(self):
        try:
            self.connection.execute('SELECT 1')
        except sqlite3.ProgrammingError:
            self.connection = self._create_connection()
        return self.connection.cursor()


class SqliteData(SqliteClient, Schema):
    def __init__(self):
        SqliteClient.__init__(self)
        self._ensure_tables()
        schema_data = self._fetch_all('cms_schema')
        schema_collections_data = self._fetch_all('cms_schema_collections')
        Schema.__init__(self, schema_data, schema_collections_data)

    def get_schema(self, raw_schema_data: list):
        return {row['id']: json.loads(row['data']) for row in raw_schema_data}

    def _ensure_tables(self):
        cursor = self.get_cursor()
        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS cms_schema (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cms_schema_collections (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cms_workspace_data (
                workspace_name TEXT NOT NULL,
                collection_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (workspace_name, collection_id, document_id)
            );
            CREATE TABLE IF NOT EXISTS cms_realtime (
                path TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
        """)
        self.connection.commit()
        cursor.close()

    def _fetch_all(self, table):
        cursor = self.get_cursor()
        cursor.execute(f"SELECT id, data FROM {table}")
        rows = [{'id': row['id'], 'data': row['data']} for row in cursor.fetchall()]
        cursor.close()
        return rows

    async def fetch_document_data(self, workspace_name, collection_id, document_id):
        cursor = self.get_cursor()
        cursor.execute(
            "SELECT data FROM cms_workspace_data WHERE workspace_name=? AND collection_id=? AND document_id=?",
            (workspace_name, collection_id, document_id)
        )
        row = cursor.fetchone()
        cursor.close()
        return json.loads(row['data']) if row else None

    def set_document_data(self, path, data):
        parts = path.strip('/').split('/')
        cursor = self.get_cursor()

        if parts[0] == '_schema' and len(parts) == 2:
            cursor.execute(
                "INSERT INTO cms_schema (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                (parts[1], json.dumps(data))
            )
        elif parts[0] == '_schema_collections' and len(parts) == 2:
            cursor.execute(
                "INSERT INTO cms_schema_collections (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                (parts[1], json.dumps(data))
            )
        elif parts[0] == '_workspace' and len(parts) == 4:
            workspace_name, collection_id, document_id = parts[1], parts[2], parts[3]
            cursor.execute(
                """INSERT INTO cms_workspace_data (workspace_name, collection_id, document_id, data)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(workspace_name, collection_id, document_id) DO UPDATE SET data=excluded.data""",
                (workspace_name, collection_id, document_id, json.dumps(data))
            )

        self.connection.commit()
        cursor.close()

    def delete_document_data(self, path):
        parts = path.strip('/').split('/')
        cursor = self.get_cursor()

        if parts[0] == '_schema' and len(parts) == 2:
            cursor.execute("DELETE FROM cms_schema WHERE id=?", (parts[1],))
        elif parts[0] == '_schema_collections' and len(parts) == 2:
            cursor.execute("DELETE FROM cms_schema_collections WHERE id=?", (parts[1],))
        elif parts[0] == '_workspace' and len(parts) == 4:
            workspace_name, collection_id, document_id = parts[1], parts[2], parts[3]
            cursor.execute(
                "DELETE FROM cms_workspace_data WHERE workspace_name=? AND collection_id=? AND document_id=?",
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
            "DELETE FROM cms_workspace_data WHERE workspace_name=? AND collection_id=?",
            (workspace_name, collection_id)
        )
        self.connection.commit()
        cursor.close()

    @staticmethod
    def get_realtime_content(path):
        client = SqliteClient()
        cursor = client.get_cursor()
        cursor.execute("SELECT data FROM cms_realtime WHERE path=?", (path,))
        row = cursor.fetchone()
        cursor.close()
        return json.loads(row['data']) if row else None

    @staticmethod
    def set_realtime_content(path, value):
        client = SqliteClient()
        cursor = client.get_cursor()
        cursor.execute(
            "INSERT INTO cms_realtime (path, data) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET data=excluded.data",
            (path, json.dumps(value))
        )
        client.connection.commit()
        cursor.close()

    @staticmethod
    def delete_realtime_content(path):
        client = SqliteClient()
        cursor = client.get_cursor()
        cursor.execute("DELETE FROM cms_realtime WHERE path=?", (path,))
        client.connection.commit()
        cursor.close()
