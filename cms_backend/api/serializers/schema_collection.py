import re
import uuid
from rest_framework.fields import empty
from rest_framework import serializers
from api.utils import PostgresData

firebaseData = PostgresData()

class SchemaCollectionSerializer(serializers.Serializer):
    _index = serializers.IntegerField()
    _collection_name = serializers.CharField(max_length=50)
    _schema_name = serializers.ChoiceField(
        choices=[],
        required=True
    )

    def __init__(self, *args, **kwargs):
        self._schema_names = kwargs.pop('schema_names', [])
        super().__init__(*args, **kwargs)

        self.fields['_schema_name'].choices = self._schema_names

    def validate__schema_name(self, value):
        """
        Field-level validation for `_schema_name`.

        - Must only be in PascalCase.
        - Numbers are not allowed.
        - Must be already created
        """
        if not re.match(r'^[A-Z][a-zA-Z]*$', value):
            raise serializers.ValidationError(
                "Invalid schema name. It must only be in PascalCase, and numbers are not allowed."
            )

        if value not in self._schema_names:
            raise serializers.ValidationError(
                "Invalid schema name. The schema doesn't exist, create a new schema or use different schema."
            )
        return value

    def create(self, validated_data):
        validated_data['_id'] = str(uuid.uuid4().hex[:20])
        collection_path = f'_schema_collections/{validated_data.get("_id")}'
        workspace_path = f'_workspace/production/{validated_data.get("_id")}/_meta_data'
        firebaseData.set_document_data(workspace_path, {"_document_sequence": []})
        firebaseData.set_document_data(collection_path, {key: value for key, value in validated_data.items() if key != '_id'})
        firebaseData.add_to_schema_collections(validated_data)
        return validated_data

    def update(self, instance, validated_data):
        """Override the update method to prevent _schema_name modification."""
        collection_id = self.context.get('collection_id')
        path = f'_schema_collections/{collection_id}'

        for attr, value in validated_data.items():
            instance[attr] = value

        instance['_id'] = collection_id
        validated_data = instance.copy()
        firebaseData.set_document_data(path, {key: value for key, value in instance.items() if key != '_id'})
        firebaseData.add_to_schema_collections(validated_data)
        return instance

    @staticmethod
    def get_field_visibility():
        return {
            '_index': {
                '_type': 'all'
            }
        }

    def get_serializer_schema(self):
        schema = {}
        field_invisibility = self.get_field_visibility()

        for field_name, field in self.fields.items():
            if field_name in ['_id']:
                continue
            if field_name == '_index':
                _type = 'index'
            elif isinstance(field, serializers.CharField):
                _type = 'input' if field.max_length != None else 'textbox'
            elif isinstance(field, serializers.MultipleChoiceField):
                _type = 'multi-select'
            elif isinstance(field, serializers.ChoiceField):
                _type = 'select'
            elif isinstance(field, serializers.BooleanField):
                _type = 'radio'
            else:
                _type = 'input'
            schema[field_name] = {
                'type': _type,
                'required': field.required,
                'default': (field.default if type(field.default) is not list else field.default[0]) if field.default is not empty else None,
                'choices': list(field.choices.keys()) if hasattr(field, 'choices') else None,
                'hide_field_for': field_invisibility[field_name] if field_name in field_invisibility.keys() else None,
            }
        return schema
