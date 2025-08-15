from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework import generics, status
from api.serializers import SchemaCollectionSerializer
from api.utils import get_data_client

firebaseData = get_data_client()

class SchemaCollectionView(generics.CreateAPIView):
    serializer_class = SchemaCollectionSerializer
    queryset = []

    def get(self, request, *args, **kwargs):
        serializer = SchemaCollectionSerializer(
            data=request.data,
            schema_names=firebaseData.schema_names
        )
        return Response({
            '_schema_collections': list(firebaseData.jsonify_data(firebaseData.schema_collections, '_collection_name').values()),
            '_collection_schema_variables': serializer.get_serializer_schema()
        })
    
    def post(self, request, *args, **kwargs):
        if kwargs.get('id'):
            raise ValidationError('POST is not allowed with an id in the URL.')
        
        serializer = SchemaCollectionSerializer(
            data=request.data,
            schema_names=firebaseData.schema_names
        )

        if serializer.is_valid():
            schema = serializer.save()
            schema = firebaseData.jsonify_data(firebaseData.schema_collections, '_collection_name')
            return Response(schema, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def put(self, request, *args, **kwargs):
        collection_id = kwargs.get('id')
        if not collection_id:
            raise ValidationError('PUT is not allowed without an id in the URL.')
        elif collection_id not in list(firebaseData.schema_collections.keys()):
            raise ValidationError('PUT is not allowed with an id which doesn\'t exist.')
        
        collection_field = firebaseData.schema_collections.get(collection_id)
        if not collection_field:
            return Response({'error': 'Collection not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = SchemaCollectionSerializer(
            collection_field,
            data=request.data,
            context={'collection_id': collection_id},
            partial=True,
            schema_names=firebaseData.schema_names
        )

        if serializer.is_valid():
            collection_field = serializer.save()
            return Response(collection_field, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, *args, **kwargs):
        schema_id = kwargs.get('id')
        if not schema_id:
            raise ValidationError('DELETE is not allowed without an id in the URL.')
        elif schema_id not in list(firebaseData.schema_collections.keys()):
            raise ValidationError('DELETE is not allowed with the schema name in the URL.')
        
        schema_field = firebaseData.schema_collections.get(schema_id)
        if not schema_field:
            return Response({'error': 'Collection not found.'}, status=status.HTTP_404_NOT_FOUND)
        elif schema_id not in list(firebaseData.schema_collections.keys()):
            raise ValidationError('DELETE is not allowed with an id which doesn\'t exist.')
        
        path = f'_schema_collections/{schema_id}'
        collection_name = firebaseData.schema_collections[schema_id].get('_collection_name')
        collection_path = f'_workspace/production/{collection_name}'
        firebaseData.delete_collection_data(collection_path)
        firebaseData.delete_document_data(path)
        firebaseData.delete_from_schema_collections(schema_id)
        return Response(status=status.HTTP_204_NO_CONTENT)