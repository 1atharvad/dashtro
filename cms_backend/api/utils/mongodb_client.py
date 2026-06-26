import hashlib
import os
import uuid
from datetime import UTC, datetime, timedelta

import certifi
import jwt
from api.utils.schema import Schema
from decouple import config
from pymongo import MongoClient


class MongoDBClient:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super().__new__(cls, *args, **kwargs)
            mongo_uri = config("MONGO_URI")
            db_name = config("MONGO_DB_NAME")
            client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
            cls._instance.db = client[db_name]
        return cls._instance


class MongoDBAuth(MongoDBClient):
    def __init__(self):
        MongoDBClient.__init__(self)

    def create_user(self, email: str, password: str):
        user_id = str(uuid.uuid4().hex)
        salt = os.urandom(16).hex()
        hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000).hex()
        self.db["cms_users"].insert_one(
            {
                "_id": user_id,
                "email": email,
                "password": f"{salt}${hashed}",
            }
        )
        return user_id

    def verify_id_token(self, id_token):
        secret = config("JWT_SECRET_KEY")
        try:
            payload = jwt.decode(id_token, secret, algorithms=["HS256"])
            return {
                "uid": payload["uid"],
                "email": payload["email"],
                "email_verified": payload.get("email_verified", True),
            }
        except jwt.ExpiredSignatureError:
            raise Exception("Token verification failed: Token has expired") from None
        except jwt.InvalidTokenError as e:
            raise Exception(f"Token verification failed: {str(e)}") from e

    def login_user(self, email: str, password: str):
        user = self.db["cms_users"].find_one({"email": email})
        stored = user.get("password", "")
        salt, _, hashed = stored.partition("$")
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000).hex()
        if not user or check != hashed:
            raise Exception("Login failed: INVALID_CREDENTIALS")

        secret = config("JWT_SECRET_KEY")
        now = datetime.now(tz=UTC)
        payload = {
            "uid": str(user["_id"]),
            "email": user["email"],
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
            "localId": str(user["_id"]),
        }

    def get_admin_token_id(self):
        admin_email = config("ADMIN_EMAIL")
        admin_password = config("ADMIN_PASSWORD")
        return self.login_user(admin_email, admin_password).get("idToken")


class MongoDBData(MongoDBClient, Schema):
    def __init__(self):
        MongoDBClient.__init__(self)
        schema_data = list(self.db["cms_schema"].find())
        schema_collections_data = list(self.db["cms_schema_collections"].find())
        Schema.__init__(self, schema_data, schema_collections_data)

    def get_schema(self, raw_schema_data: list):
        return {str(doc["_id"]): doc.get("data", {}) for doc in raw_schema_data}

    async def fetch_document_data(self, workspace_name, collection_id, document_id):
        doc = self.db["cms_workspace_data"].find_one(
            {
                "workspace_name": workspace_name,
                "collection_id": collection_id,
                "document_id": document_id,
            }
        )
        return doc["data"] if doc else None

    def set_document_data(self, path, data):
        parts = path.strip("/").split("/")

        if parts[0] == "_schema" and len(parts) == 2:
            self.db["cms_schema"].replace_one(
                {"_id": parts[1]}, {"_id": parts[1], "data": data}, upsert=True
            )
        elif parts[0] == "_schema_collections" and len(parts) == 2:
            self.db["cms_schema_collections"].replace_one(
                {"_id": parts[1]}, {"_id": parts[1], "data": data}, upsert=True
            )
        elif parts[0] == "_workspace" and len(parts) == 4:
            workspace_name, collection_id, document_id = parts[1], parts[2], parts[3]
            self.db["cms_workspace_data"].replace_one(
                {
                    "workspace_name": workspace_name,
                    "collection_id": collection_id,
                    "document_id": document_id,
                },
                {
                    "workspace_name": workspace_name,
                    "collection_id": collection_id,
                    "document_id": document_id,
                    "data": data,
                },
                upsert=True,
            )

    def delete_document_data(self, path):
        parts = path.strip("/").split("/")

        if parts[0] == "_schema" and len(parts) == 2:
            self.db["cms_schema"].delete_one({"_id": parts[1]})
        elif parts[0] == "_schema_collections" and len(parts) == 2:
            self.db["cms_schema_collections"].delete_one({"_id": parts[1]})
        elif parts[0] == "_workspace" and len(parts) == 4:
            workspace_name, collection_id, document_id = parts[1], parts[2], parts[3]
            self.db["cms_workspace_data"].delete_one(
                {
                    "workspace_name": workspace_name,
                    "collection_id": collection_id,
                    "document_id": document_id,
                }
            )

    def delete_collection_data(self, path):
        parts = path.strip("/").split("/")
        if parts[0] != "_workspace" or len(parts) != 3:
            return
        workspace_name, collection_id = parts[1], parts[2]
        self.db["cms_workspace_data"].delete_many(
            {
                "workspace_name": workspace_name,
                "collection_id": collection_id,
            }
        )

    @staticmethod
    def get_realtime_content(path):
        client = MongoDBClient()
        doc = client.db["cms_realtime"].find_one({"_id": path})
        return doc["data"] if doc else None

    @staticmethod
    def set_realtime_content(path, value):
        client = MongoDBClient()
        client.db["cms_realtime"].replace_one(
            {"_id": path}, {"_id": path, "data": value}, upsert=True
        )

    @staticmethod
    def delete_realtime_content(path):
        client = MongoDBClient()
        client.db["cms_realtime"].delete_one({"_id": path})
