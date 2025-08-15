from django.urls import path
from api import views

urlpatterns = [
    path('auth/', views.AuthView.as_view(), name='auth_view'),
    path('workspace/<str:workspace_name>/collection/<str:collection_name>/', views.DynamicDocumentView.as_view(), name='collection_view'),
    path('workspace/<str:workspace_name>/collection/<str:collection_name>/document/<str:document_id>/', views.DynamicDocumentView.as_view(), name='collection_view'),
    path('collections/', views.SchemaCollectionView.as_view(), name='schema_collection'),
    path('collections/<str:id>/', views.SchemaCollectionView.as_view(), name='schema_collection_update'),
    path('schema/', views.SchemaView.as_view(), name='schema_field_create'),
    path('schema/<str:id>/', views.SchemaView.as_view(), name='schema_field_update')
]