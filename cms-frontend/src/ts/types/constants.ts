import type { store } from '@/redux/store';

// ---- category ----
export type Category = { id: string; name: string };

// ---- collection ----
// Mirrors models.collection.SchemaCollectionIn.to_storage() in the backend.
export interface SchemaCollectionItem {
  _id: string;
  _index: number;
  _collection_name: string;
  _schema_name: string;
}

// Mirrors models.collection.get_collection_ui_schema() in the backend.
export interface CollectionFieldSchema {
  type: string;
  required: boolean;
  default: string | number | null;
  choices: string[] | null;
  hide_field_for: Record<string, string> | null;
}

export type CollectionUiSchema = Record<string, CollectionFieldSchema>;

export type NewCollectionInput = Partial<{
  _index: number;
  _collection_name: string;
  _schema_name: string;
}>;

export interface CollectionsResponse {
  _schema_collections: SchemaCollectionItem[];
  _collection_schema_variables: CollectionUiSchema;
}

export type CollectionEntryData = { [key: string]: string | number };

// ---- colorMode ----
export interface ColorModeContextValue {
  mode: 'light' | 'dark';
  toggleColorMode: () => void;
}

// ---- document ----
// A document's shape is entirely driven by its collection's schema (arbitrary
// user-defined fields), so only the fields the backend always manages are typed.
export interface DocumentData {
  _id?: string;
  _status?: "draft" | "published";
  [key: string]: unknown;
}

export type NewDocumentInput = Partial<DocumentData>;

// Mirrors the payload returned by GET .../collection/{collection_name}/ in documents.py.
export interface CollectionMeta {
  _schema_name: string;
  _schema: unknown;
  _document_ids: string[];
  _document_statuses: Record<string, "draft" | "published">;
  _document_labels: Record<string, string>;
}

// Mirrors api.utils.data.DataClient document version records.
export type DocumentVersion = {
  id: string;
  version_number: number;
  created_at: string;
  created_by_id: string;
  created_by_email: string;
};

// ---- fieldRegistry ----
export type SubFieldDef = {
  name: string;
  label: string;
  input_type: 'text' | 'number' | 'checkbox';
};

export type CompoundFieldDef = {
  dedicated_component: boolean;
  subfields: SubFieldDef[];
  default: Record<string, unknown>;
};

export type FieldTypeRegistry = {
  all_types: string[];
  compound_types: Record<string, CompoundFieldDef>;
};

// ---- json ----
// The Realtime Database (api.utils.*.get_rtdb_path/set_rtdb_path in the
// backend) stores arbitrary JSON at any path, so its value type is
// genuinely recursive rather than a fixed shape.
export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

// ---- link ----
export interface CustomLink {
  url: string,
  text?: string,
  is_external_link: boolean
}

// ---- linkDrawer ----
export interface DrawerFooterSlotProps {
  isOpen: boolean;
}

// ---- richText ----
export type RichTextComponent = { id: string; name: string; source: string; css: string; sampleHtml: string };

// ---- rtdb ----
export type RtdbValueType = 'string' | 'number' | 'float' | 'boolean' | 'null' | 'list' | 'dict';

// ---- schema ----
// Mirrors models.field_types.ALL_FIELD_TYPES in the backend.
export const FIELD_TYPES = [
  "String", "Number", "Boolean", "Email", "Date", "DateTime", "Color", "RichText", "Textarea",
  "Image", "URL", "File", "ScrollLink", "NestedDocument", "ReferenceDocument",
] as const;
export type FieldType = typeof FIELD_TYPES[number];

// Mirrors models.schema.SchemaFieldIn.to_storage() in the backend.
// `_schema_name` is stripped by api.utils.schema.schema_jsonify() when a
// field is returned as part of a schema's field list (GET /schema/{schema_name}/),
// but present when a single field is created/updated/deleted.
export interface SchemaFieldItem {
  _id: string;
  _index: number;
  _name: string;
  _type: FieldType;
  _description: string;
  _relation: "OneToOne" | "OneToMany";
  _default_value: string;
  _placeholder: string;
  _nested_schema: string;
  _reference_schema: string[];
  _rich_text_wrapper: string;
  _display_name: boolean;
  _required: boolean;
  _schema_name?: string;
}

// Mirrors models.schema.get_schema_field_ui_schema() in the backend.
export interface SchemaFieldUiSchema {
  type: string;
  required: boolean;
  default: string | boolean | null;
  choices: string[] | null;
  hide_field_for: Record<string, string | string[]> | null;
}

export type SchemaVariablesSchema = Record<string, SchemaFieldUiSchema>;

export interface SchemaListResponse {
  _schema_names: string[];
  _schema_variables: SchemaVariablesSchema;
}

export type NewSchemaFieldInput = Partial<{
  _index: number;
  _name: string;
  _type: FieldType;
  _description: string;
  _relation: "OneToOne" | "OneToMany";
  _default_value: string;
  _placeholder: string;
  _nested_schema: string;
  _reference_schema: string[];
  _rich_text_wrapper: string;
  _display_name: boolean;
  _required: boolean;
  _schema_name: string;
}>;

export type SchemaEntryData = { [key: string]: string | number | boolean | string[] };

// ---- store ----
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// ---- user ----
export interface CurrentUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  initials: string;
  role: string;
  avatarUrl?: string;
}

export interface UserContextValue {
  user: CurrentUser | null;
  refreshUser: () => Promise<void>;
}

// ---- workspace ----
export type WorkspaceDiffDoc = { document_id: string; data: DocumentData };
export type WorkspaceDiffModifiedDoc = {
  document_id: string;
  source_data: DocumentData;
  target_data: DocumentData;
  changed_fields: string[];
};
export type WorkspaceDiffBucket = {
  source_only: WorkspaceDiffDoc[];
  target_only: WorkspaceDiffDoc[];
  modified: WorkspaceDiffModifiedDoc[];
};
export type WorkspaceDiff = Record<string, WorkspaceDiffBucket>;
