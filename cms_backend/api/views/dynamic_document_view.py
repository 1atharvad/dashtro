from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.exceptions import ValidationError
from rest_framework import generics, status
from api.serializers import create_dynamic_serializer
from api.utils import get_data_client
import asyncio

firebaseData = get_data_client()

class DynamicDocumentView(generics.GenericAPIView):
    def get_view_name(self):
        """
        Returns a short name for this API view.
        Used by DRF in documentation tools or UI views.
        """
        return 'Document / Collection View'
    
    def get_view_description(self, html=False):
        """
        Returns a brief description of the view's purpose.
        Optionally returns HTML if requested.
        """
        return 'API view for dynamically managing content for documents and collections.'
    
    @staticmethod
    def get_schema_data(collection_name):
        """
        Fetches schema data for the given collection name.
        Raises a ValidationError if the schema retrieval fails.
        """
        schema_result = firebaseData.get_schema_for_collection(collection_name)
        if isinstance(schema_result, dict) and 'error' in schema_result:
            raise ValidationError({'error': schema_result['error']})
        return schema_result
    
    @staticmethod
    def normalize_content(data):
        """
        Converts an empty list with a single empty string [''] to an empty list [].
        Used to sanitize Firebase data format.
        """
        if isinstance(data, list) and data == ['']:
            return []
        return data
    
    def get_serializer_class(self):
        """
        Returns a dynamically generated serializer based on the schema
        associated with the current collection.
        """
        collection_name = self.kwargs.get('collection_name')
        _, _, schema_data = self.get_schema_data(collection_name)
        return create_dynamic_serializer({field['_name']: field for field in schema_data})
    
    def get(self, request,  *args, **kwargs):
        """
        Handles GET requests. If `document_id` is provided, returns the document content.
        If not, returns schema and available document IDs.
        """
        workspace_name = self.kwargs.get('workspace_name')
        document_id = self.kwargs.get('document_id')
        collection_id, schema_name, schema_data = self.get_schema_data(
            self.kwargs.get('collection_name')
        )
        
        meta_data = asyncio.run(firebaseData.fetch_document_data(
            workspace_name=workspace_name,
            collection_id=collection_id,
            document_id='_meta_data'
        ))
        document_ids = self.normalize_content(meta_data['_document_sequence'])

        if not document_id:
            return Response({
                '_schema_name': schema_name,
                '_schema': schema_data,
                '_document_ids': document_ids
            })
        elif document_id in document_ids:
            return Response(asyncio.run(firebaseData.fetch_document_data(
                workspace_name=workspace_name,
                collection_id=collection_id,
                document_id=document_id
            )))
        else:
            return Response({
                'error': 'Document not found in the collection, incorrect document id.',
            }, status=status.HTTP_404_NOT_FOUND)

    def post(self, request: Request, *args, **kwargs):
        """
        Handles POST requests for creating a new document.
        Raises error if `document_id` is provided in the URL.
        """
        workspace_name = self.kwargs.get('workspace_name')
        collection_id, _, _ = self.get_schema_data(
            self.kwargs.get('collection_name')
        )
        document_id = self.kwargs.get('document_id')

        if document_id:
            raise ValidationError('POST is not allowed with an document id in the URL.')
        
        meta_data = asyncio.run(firebaseData.fetch_document_data(
            workspace_name=workspace_name,
            collection_id=collection_id,
            document_id='_meta_data'
        ))
        document_sequence = self.normalize_content(meta_data['_document_sequence'])
        
        serializer = self.get_serializer(
            data=request.data,
            context={'document_sequence': document_sequence},
            workspace_name=workspace_name,
            collection_id=collection_id
        )

        if serializer.is_valid():
            document_content = serializer.save()
            return Response(document_content, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def put(self, request, *args, **kwargs):
        """
        Handles PUT requests for updating an existing document.
        Validates the presence of the `document_id` and ensures it exists in the collection.
        """
        workspace_name = self.kwargs.get('workspace_name')
        collection_id, _, _ = self.get_schema_data(
            self.kwargs.get('collection_name')
        )
        document_id = self.kwargs.get('document_id')

        meta_data = asyncio.run(firebaseData.fetch_document_data(
            workspace_name=workspace_name,
            collection_id=collection_id,
            document_id='_meta_data'
        ))
        existing_document_ids = self.normalize_content(meta_data['_document_sequence'])

        if not document_id:
            raise ValidationError('PUT is not allowed without an id in the URL.')
        elif document_id not in existing_document_ids:
            raise ValidationError('PUT is not allowed with an id which doesn\'t exist.')
        
        document_content = asyncio.run(firebaseData.fetch_document_data(
            workspace_name=workspace_name,
            collection_id=collection_id,
            document_id=document_id
        ))
        if not document_content:
            return Response({'error': 'Document not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = self.get_serializer(
            document_content,
            data=request.data,
            context={'document_id': document_id},
            partial=True,
            workspace_name=workspace_name,
            collection_id=collection_id
        )

        if serializer.is_valid():
            document_content = serializer.save()
            return Response(document_content, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request: Request, *args, **kwargs):
        """
        Handles DELETE requests for removing a document from the collection.
        Ensures the document exists before deletion.
        """
        workspace_name = self.kwargs.get('workspace_name')
        collection_id, _, _ = self.get_schema_data(
            self.kwargs.get('collection_name')
        )
        document_id = self.kwargs.get('document_id')

        meta_data = asyncio.run(firebaseData.fetch_document_data(
            workspace_name=workspace_name,
            collection_id=collection_id,
            document_id='_meta_data'
        ))
        existing_document_ids = self.normalize_content(meta_data['_document_sequence'])

        if not document_id:
            raise ValidationError('DELETE is not allowed without an id in the URL.')
        elif document_id not in existing_document_ids:
            raise ValidationError('DELETE is not allowed with an id which doesn\'t exist.')
        
        document_path = f'_workspace/{workspace_name}/{collection_id}/{document_id}'
        meta_data_path = f'_workspace/{workspace_name}/{collection_id}/_meta_data'
        updated_ids = list(filter(lambda id: id != document_id, existing_document_ids)) or []
        firebaseData.set_document_data(meta_data_path, {'_document_sequence': updated_ids})
        firebaseData.delete_document_data(document_path)

        return Response({'detail': 'Delete operation successful'}, status=status.HTTP_204_NO_CONTENT)
