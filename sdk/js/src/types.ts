export interface CollectionMeta {
  _schema_name: string;
  _schema: Record<string, unknown>;
  _document_ids: string[];
  _document_statuses: Record<string, string>;
}

export interface Document {
  _id?: string;
  _status?: string;
  [key: string]: unknown;
}

export interface DashtroClientOptions {
  baseUrl: string;
  projectId: string;
  apiKey: string;
  workspace?: string;
  cacheTtl?: number; // seconds, default 60
}

export interface RtdbUpdate {
  type: 'put' | 'patch' | 'delete';
  path: string;
  value: unknown;
}
