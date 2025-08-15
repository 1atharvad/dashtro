import uuid
from rest_framework import serializers
from api.utils import get_data_client

firebaseData = get_data_client()

def get_serializer_field(key_info):
    field_type = key_info.get('_type', 'String')
    description = key_info.get('_description', '')
    default = key_info.get('_default_value', None)
    required = key_info.get('_required', True)

    if field_type == 'String':
        return serializers.CharField(
            help_text=description,
            initial=default or '',
            required=required
        )
    elif field_type == 'Number':
        return serializers.IntegerField(
            help_text=description,
            initial=default or '',
            required=required
        )
    elif field_type == 'NestedDocument':
        if key_info.get('_relation', '') == 'OneToMany':
            return serializers.ListField(
                child=serializers.DictField(),
                help_text=description,
                initial=default or [],
                required=required
            )
        else:
            return serializers.DictField(
                help_text=description,
                initial=default or {},
                required=required
            )
    else:
        return serializers.CharField(
            help_text=description,
            initial=default or '',
            required=required
        )

def create_dynamic_serializer(schema):
    fields = {key: get_serializer_field(key_info) for key, key_info in schema.items()}

    class DynamicSerializer(serializers.Serializer):
        locals().update(fields)

        def __init__(self, *args, **kwargs):
            self._workspace_name = kwargs.pop('workspace_name', 'production')
            self._collection_id = kwargs.pop('collection_id', '')
            super().__init__(*args, **kwargs)
        
        def create(self, validated_data):
            validated_data['_id'] = str(uuid.uuid4().hex[:20])
            path = f'_workspace/{self._workspace_name}/{self._collection_id}/{validated_data["_id"]}'
            ids_path = f'_workspace/{self._workspace_name}/{self._collection_id}/_meta_data'

            for field_name, _ in self.fields.items():
                if field_name not in validated_data:
                    default_value = schema[field_name].get('_default_value', '')
                    validated_data[field_name] = default_value
            firebaseData.set_document_data(path, {key: value for key, value in validated_data.items() if key != '_id'})

            document_sequence = self.context.get('document_sequence')
            document_sequence = [*document_sequence, *[validated_data['_id']]]
            firebaseData.set_document_data(ids_path, {'_document_sequence': document_sequence})
            return validated_data
        
        def update(self, instance, validated_data):
            """Override the update method to prevent _schema_name modification."""
            validated_data['_id'] = self.context.get('document_id')
            path = f'_workspace/{self._workspace_name}/{self._collection_id}/{validated_data["_id"]}'
            
            for attr, value in validated_data.items():
                instance[attr] = value
            validated_data = instance.copy()
            firebaseData.set_document_data(path, {key: value for key, value in validated_data.items() if key != '_id'})
            return instance

    return DynamicSerializer