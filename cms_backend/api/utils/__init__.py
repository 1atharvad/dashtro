from decouple import config
from .schema import Schema
from .postgres_client import PostgresData, PostgresAuth
from .sqlite_client import SqliteData
from .mongodb_client import MongoDBData, MongoDBAuth

_DB_BACKEND = config('DB_BACKEND', default='postgres')


def get_data_client():
    if _DB_BACKEND == 'sqlite':
        return SqliteData()
    elif _DB_BACKEND == 'mongodb':
        return MongoDBData()
    return PostgresData()


def get_auth_client():
    if _DB_BACKEND == 'mongodb':
        return MongoDBAuth()
    return PostgresAuth()


__all__ = [
    'Schema',
    'PostgresData', 'PostgresAuth',
    'SqliteData',
    'MongoDBData', 'MongoDBAuth',
    'get_data_client', 'get_auth_client',
]
