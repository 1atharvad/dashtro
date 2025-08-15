import re
import uuid
from rest_framework.fields import empty
from rest_framework import serializers
from api.utils import get_data_client

firebaseData = get_data_client()

class SchemaFieldSerializer(serializers.Serializer):
    _id = serializers.CharField(read_only=True)
    _index = serializers.IntegerField()
    _name = serializers.CharField(max_length=50)
    _type = serializers.ChoiceField(
        choices=[
            ('String', 'String'),
            ('Number', 'Number'),
            ('Boolean', 'Boolean'),
            ('NestedDocument', 'NestedDocument'),
            ('ReferenceDocument', 'ReferenceDocument')
        ],
        default='String'
    )
    _description = serializers.CharField(
        required=False,
        allow_blank=True,
        default=''
    )
    _relation = serializers.ChoiceField(
        choices=[
            ('OneToOne', 'OneToOne'),
            ('OneToMany', 'OneToMany')
        ],
        default='OneToOne'
    )
    _default_value = serializers.CharField(max_length=50, default='')
    _nested_schema = serializers.ChoiceField(
        choices=[],
        default=''
    )
    _reference_schema = serializers.MultipleChoiceField(
        choices=[],
        default=['']
    )
    _display_name = serializers.BooleanField(default=False)
    _required = serializers.BooleanField(default=False)
    _schema_name = serializers.CharField(max_length=50)

    def __init__(self, *args, **kwargs):
        choices = kwargs.pop('schema_names', [])
        super().__init__(*args, **kwargs)
        
        self.fields['_nested_schema'].choices = choices
        self.fields['_reference_schema'].choices = choices

    def validate__schema_name(self, value):
        """
        Field-level validation for `_schema_name`.

        - Must only be in PascalCase.
        - Numbers are not allowed.
        """
        if not re.match(r'^[A-Z][a-zA-Z]*$', value):
            raise serializers.ValidationError(
                "Invalid schema name. It must only be in PascalCase, and numbers are not allowed."
            )
        return value
    
    def validate__name(self, value):
        """
        Field-level validation for `_name`.

        - Must only be in snake_case.
        - Numbers are not allowed.
        """
        if not re.match(r'^[a-z]+(_[a-z]+)*$', value):
            raise serializers.ValidationError(
                "Invalid name. It must be in snake_case without numbers (e.g., 'schema_name')."
            )
        return value
    
    def validate__type(self, value):
        """
        Ensure that at least one choice is selected for `_type`.
        """
        if not value:
            raise serializers.ValidationError("At least one type must be selected.")
        return value

    def create(self, validated_data):
        validated_data['_id'] = str(uuid.uuid4().hex[:20])
        instance = validated_data.copy()
        path = f'_schema/{validated_data.get("_id")}'
        firebaseData.set_document_data(path, {key: value for key, value in validated_data.items() if key != '_id'})
        firebaseData.add_to_schema(validated_data)
        return instance
    
    def update(self, instance, validated_data):
        """Override the update method to prevent _schema_name modification."""
        schema_id = self.context.get('schema_id')
        path = f'_schema/{schema_id}'

        for attr, value in validated_data.items():
            if attr == "_schema_name":
                continue
            instance[attr] = value

        instance['_id'] = schema_id
        validated_data = instance.copy()
        firebaseData.set_document_data(path, {key: value for key, value in instance.items() if key != '_id'})
        firebaseData.add_to_schema(validated_data)
        return instance
    
    @staticmethod
    def get_field_visibility():
        return {
            '_index': {
                '_type': 'all'
            },
            '_default_value': {
                '_type': ['ReferenceDocument', 'NestedDocument']
            },
            '_nested_schema': {
                '_type': ['String', 'Number', 'Boolean', 'ReferenceDocument']
            },
            '_reference_schema': {
                '_type': ['String', 'Number', 'Boolean', 'NestedDocument']
            },
            '_schema_name': {
                '_type': 'all'
            },
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
