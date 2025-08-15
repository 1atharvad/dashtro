from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.exceptions import ValidationError
from rest_framework import generics, serializers, status
from api.serializers import SchemaFieldSerializer
from api.utils import get_data_client

firebaseData = get_data_client()
    
class SchemaView(generics.CreateAPIView):
    serializer_class = SchemaFieldSerializer
    queryset = []
    
    def get(self, request, *args, **kwargs):
        schema_id = kwargs.get('id')
        if schema_id:
            if schema_id in firebaseData.schema_names:
                schema_field = firebaseData.schema_jsonify(allowed_schema_name=schema_id, sort_indices=True)
            else:
                schema_field = firebaseData.schema.get(schema_id)
            if not schema_field:
                return Response({'error': 'Schema not found.'}, status=status.HTTP_404_NOT_FOUND)
            return Response(schema_field)
        
        serializer = SchemaFieldSerializer(data=request.data, schema_names=firebaseData.schema_names)
        return Response({
            '_schema_names': firebaseData.schema_names,
            '_schema_variables': serializer.get_serializer_schema()
        })
    
    def post(self, request, *args, **kwargs):
        if kwargs.get('id'):
            raise ValidationError('POST is not allowed with an id in the URL.')
        
        serializer = SchemaFieldSerializer(data=request.data, schema_names=firebaseData.schema_names)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.instance, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def put(self, request, *args, **kwargs):
        schema_id = kwargs.get('id')
        if not schema_id:
            raise ValidationError('PUT is not allowed without an id in the URL.')
        elif schema_id in firebaseData.schema_names:
            raise ValidationError('PUT is not allowed with the schema name in the URL.')
        elif schema_id not in list(firebaseData.schema.keys()):
            raise ValidationError('PUT is not allowed with an id which doesn\'t exist.')
        
        schema_field = firebaseData.schema.get(schema_id)
        if not schema_field:
            return Response({'error': 'Schema not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = SchemaFieldSerializer(
            schema_field,
            data=request.data,
            context={'schema_id': schema_id},
            partial=True,
            schema_names=firebaseData.schema_names
        )

        if serializer.is_valid():
            schema_field = serializer.save()
            return Response(schema_field, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, *args, **kwargs):
        schema_id = kwargs.get('id')
        if not schema_id:
            raise ValidationError('DELETE is not allowed without an id in the URL.')
        elif schema_id in firebaseData.schema_names:
            raise ValidationError('DELETE is not allowed with the schema name in the URL.')
        elif schema_id not in list(firebaseData.schema.keys()):
            raise ValidationError('DELETE is not allowed with an id which doesn\'t exist.')
        
        schema_field = firebaseData.schema.get(schema_id)
        if not schema_field:
            return Response({'error': 'Schema not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        path = f'_schema/{schema_id}'
        firebaseData.delete_document_data(path)

        for _id in firebaseData.delete_from_schema(schema_id):
            firebaseData.set_document_data(f'_schema/{_id}', firebaseData.schema[_id])
        
        return Response(status=status.HTTP_204_NO_CONTENT)