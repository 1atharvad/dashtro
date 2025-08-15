import requests
import firebase_admin
from firebase_admin import credentials, firestore, db, auth
import json
import asyncio
from api.utils.schema import Schema
from decouple import config

class FirebaseClient:
    _instance = None
    _service_key = './service-key.json'

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(FirebaseClient, cls).__new__(cls, *args, **kwargs)
            cls._instance.connection = "Your Firebase Connection"

            if not firebase_admin._apps:
                project_id = cls.get_database_name(cls._service_key)
                cred = credentials.Certificate(cls._service_key)
                firebase_admin.initialize_app(cred, {
                    'databaseURL': f'https://{project_id}-default-rtdb.firebaseio.com/'
                })
        return cls._instance

    @staticmethod
    def get_database_name(service_key_path):
        with open(service_key_path, 'r') as file:
            data = json.load(file)

        return data['project_id']

class FirebaseAuth(FirebaseClient):
    def __init__(self):
        super().__init__()

    def create_user(self, email: str, password: str):
        user = auth.create_user(
            email=email,
            password=password
        )
        return user.uid

    def verify_id_token(self, id_token):
        try:
            decoded_token = auth.verify_id_token(id_token)
            return decoded_token
        except Exception as e:
            raise Exception(f"Token verification failed: {str(e)}")

    def login_user(self, email: str, password: str):
        API_KEY = config('FIREBASE_API_KEY')
        url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}"

        payload = {
            "email": email,
            "password": password,
            "returnSecureToken": True
        }
        response = requests.post(url, json=payload)
        data = response.json()

        if "error" in data:
            raise Exception(f"Login failed: {data['error']['message']}")

        return {
            "idToken": data["idToken"],
            "refreshToken": data["refreshToken"],
            "localId": data["localId"]
        }

    def get_admin_token_id(self):
        ADMIN_EMAIL = config('ADMIN_EMAIL')
        ADMIN_PASSWORD = config('ADMIN_PASSWORD')

        return self.login_user(ADMIN_EMAIL, ADMIN_PASSWORD).get('idToken')

class FirebaseData(FirebaseClient, Schema):
    def __init__(self):
        FirebaseClient.__init__(self)
        self.store = firestore.client()
        schema = self.store.collection(f'_schema').get()
        schema_collections = self.store.collection(f'_schema_collections').get()
        Schema.__init__(self, schema, schema_collections)

    async def fetch_and_unpack(self, doc_ref: firestore.firestore.DocumentReference):
        doc_snapshot = await asyncio.to_thread(doc_ref.get)
        return await self.unpack_doc_ref(doc_snapshot.to_dict())

    async def unpack_doc_ref(self, doc_data):
        for _key, value in doc_data.items():
            if isinstance(value, list):
                tasks = []
                for sub_data in value:
                    if isinstance(sub_data, firestore.firestore.DocumentReference):
                        tasks.append(self.fetch_and_unpack(sub_data))
                    else:
                        tasks.append(asyncio.sleep(0, result=sub_data))
                results = await asyncio.gather(*tasks)
                doc_data[_key] = results
            elif isinstance(value, firestore.firestore.DocumentReference):
                doc_data[_key] = await self.fetch_and_unpack(value)
        return doc_data

    async def fetch_document_data(self, workspace_name, collection_id, document_id):
        path = f'_workspace/{workspace_name}/{collection_id}/{document_id}'
        dof_ref = self.store.document(path)
        return await self.fetch_and_unpack(dof_ref)

    def set_document_data(self, path, data):
        doc_ref = self.store.document(f'{path}')
        doc_ref.set(data)

    def delete_document_data(self, path):
        doc_ref = self.store.document(f'{path}')
        doc_ref.delete()

    def delete_collection_data(self, path):
        coll_ref = self.store.collection(f'{path}')

        for doc in coll_ref.stream():
            doc.reference.delete()

    @staticmethod
    def get_realtime_content(path):
        return db.reference(path).get()

    @staticmethod
    def set_realtime_content(path, value):
        return db.reference(path).set(value)

    @staticmethod
    def delete_realtime_content(path):
        return db.reference(path).delete()

if __name__ == '__main__':
    api_key = 'REDACTED-ROTATED-KEY'
    firebaseAuth = FirebaseAuth()
    # print(firebaseAuth.create_user('atharvadevasthali22@gmail.com', 'asd@12345'))
    data = firebaseAuth.login_user('atharvadevasthali22@gmail.com', 'asd@12345', api_key)
    print(data, firebaseAuth.verify_id_token(data['idToken']))

    # firebaseData = FirebaseData()
    # print(json.dumps(
    #     asyncio.run(firebaseData.fetch_document_data('portfolio', 'fQceYKreWBjS9WfY1E4S')),
    #     indent=2
    # ))
    # asyncio.run(firebaseData.fetch_document_data('global-details', 'vtJHCyAzyZYh5mLHQ8Wc'))
