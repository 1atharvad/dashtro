class Schema:
    def __init__(self, schema_data: list, schema_collection: list):
        self.schema = self.get_schema(schema_data)
        self.schema_names = self.get_schema_names()
        self.schema_collections = self.get_schema(schema_collection)

    def schema_jsonify(self, extra_content=None, allowed_schema_name=None, sort_indices=False):
        schema = {}

        for schema_id, schema_data in self.schema.items():
            schema_name = schema_data['_schema_name']

            if allowed_schema_name:
                if allowed_schema_name != schema_name:
                    continue
            schema_data['_id'] = schema_id

            if schema_name not in schema.keys():
                schema[schema_name] = []
            schema[schema_name].append({key: value for key, value in schema_data.items() if key != '_schema_name'})

        if sort_indices:
            for schema_id, schema_data in schema.items():
                schema[schema_id] = sorted(schema_data, key=lambda data: data['_index'])

        if extra_content:
            schema = {**schema, **extra_content}

        return schema
    
    def jsonify_data(self, data: dict, key: str):
        json_data = {}

        for id, value in data.items():
            key_val = value[key]
            value['_id'] = id
            json_data[key_val] = {key: _value for key, _value in value.items()}

        return json_data

    def get_schema(self, raw_schema_data: list):
        return {document.id: document.to_dict() for document in raw_schema_data}
    
    def get_schema_names(self):
        schema_names = []

        for document in self.schema.values():
            if document['_schema_name'] not in schema_names:
                schema_names.append(document['_schema_name'])

        return schema_names
    
    def get_schema_collection_info(self, collection_name):
        collection_data = list(filter(lambda collection: collection['_collection_name'] == collection_name, self.jsonify_data(self.schema_collections, '_collection_name').values()))
        
        return collection_data[0] if len(collection_data) > 0 else None
    
    def get_schema_for_collection(self, collection_name):
        collection_info = self.get_schema_collection_info(collection_name)
        if not collection_info:
            return {'error': 'Invalid document name, no schema found for that document.'}
        collection_id = collection_info.get('_id')
        schema_name = collection_info.get('_schema_name')
        schema_data = self.schema_jsonify(allowed_schema_name=schema_name, sort_indices=True)
        return collection_id, schema_name, schema_data.get(schema_name)
    
    def add_to_schema(self, schema_data):
        id = schema_data['_id']
        schema_data.pop('_id')
        self.schema[id] = schema_data
        schema_name = schema_data['_schema_name']

        if schema_name not in self.schema_names:
            self.schema_names.append(schema_name)

    def add_to_schema_collections(self, data):
        id = data['_id']
        data.pop('_id')
        self.schema_collections[id] = data

    def delete_from_schema(self, id):
        schema_index = self.schema[id]['_index']
        schema_name = self.schema[id]['_schema_name']
        schema_ids=[]
        schema_item_count = 0

        for schema_id, schema_data in self.schema.items():
            if schema_name == schema_data['_schema_name']:
                if schema_data['_index'] > schema_index:
                    schema_data['_index'] -= 1
                    self.schema[schema_id] = schema_data
                    schema_ids.append(schema_id)
                schema_item_count += 1
        self.schema.pop(id)

        if schema_item_count == 1:
            self.schema_names.remove(schema_name)

        return schema_ids

    def delete_from_schema_collections(self, id):
        self.schema_collections.pop(id)