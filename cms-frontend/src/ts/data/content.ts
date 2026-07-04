export const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  signup: 'Signup',
  create_project: 'Create Project',
  create_workspace: 'Create Workspace',
  create_schema_field: 'Create Schema Field',
  create_collection: 'Create Collection',
  create_document: 'Create Document',
  create_category: 'Create Category',
  create_api_key: 'Create API Key',
  update_project: 'Update Project',
  update_profile: 'Update Profile',
  update_schema_field: 'Update Schema Field',
  update_collection: 'Update Collection',
  update_document: 'Update Document',
  update_category: 'Update Category',
  push_to_production: 'Push to Production',
  pull_from_production: 'Pull from Production',
  push_collection_to_production: 'Push Collection to Production',
  pull_collection_from_production: 'Pull Collection from Production',
  push_document_to_production: 'Push Document to Production',
  pull_document_from_production: 'Pull Document from Production',
  assign_category: 'Assign Category',
  delete_project: 'Delete Project',
  delete_workspace: 'Delete Workspace',
  delete_schema_field: 'Delete Schema Field',
  delete_collection: 'Delete Collection',
  delete_document: 'Delete Document',
  delete_category: 'Delete Category',
  delete_api_key: 'Delete API Key',
  delete_user: 'Delete User',
  change_password: 'Change Password',
  upload_media: 'Upload Media',
};

export const ACTION_COLORS: Record<string, 'success' | 'info' | 'error' | 'warning' | 'default'> = {
  login: 'success',
  signup: 'success',
  create_project: 'info',
  create_workspace: 'info',
  create_schema_field: 'info',
  create_collection: 'info',
  create_document: 'info',
  create_category: 'info',
  create_api_key: 'info',
  update_project: 'warning',
  update_profile: 'warning',
  update_schema_field: 'warning',
  update_collection: 'warning',
  update_document: 'warning',
  update_category: 'warning',
  push_to_production: 'warning',
  pull_from_production: 'warning',
  push_collection_to_production: 'warning',
  pull_collection_from_production: 'warning',
  push_document_to_production: 'warning',
  pull_document_from_production: 'warning',
  assign_category: 'warning',
  delete_project: 'error',
  delete_workspace: 'error',
  delete_schema_field: 'error',
  delete_collection: 'error',
  delete_document: 'error',
  delete_category: 'error',
  delete_api_key: 'error',
  delete_user: 'error',
  change_password: 'default',
  upload_media: 'default',
};

export const RESOURCE_TYPES = [
  'user', 'api_key', 'project', 'workspace',
  'schema_field', 'collection', 'document', 'schema_category', 'media',
];

export const AUDIT_PAGE_SIZE = 50;

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const HEATMAP_CELL = 13;
export const HEATMAP_GAP = 3;
export const HEATMAP_CELL_MONTH = 22;
