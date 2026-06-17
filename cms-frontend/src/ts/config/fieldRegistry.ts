/**
 * Field type registry — fetched from GET /api/cms/field-types/
 * Python (field_types.py) is the single source of truth.
 * Do NOT hardcode types here — add them to the backend registry.
 */

import { API_BASE_URL } from '@ts/config';

export type SubFieldDef = {
  name: string;
  label: string;
  input_type: 'text' | 'number' | 'checkbox';
};

export type CompoundFieldDef = {
  dedicated_component: boolean;
  subfields: SubFieldDef[];
  default: Record<string, any>;
};

export type FieldTypeRegistry = {
  all_types: string[];
  compound_types: Record<string, CompoundFieldDef>;
};

let _cache: FieldTypeRegistry | null = null;

export async function fetchFieldRegistry(): Promise<FieldTypeRegistry> {
  if (_cache) return _cache;
  const res = await fetch(`${API_BASE_URL}/field-types/`);
  _cache = await res.json();
  return _cache!;
}

export function getRegistry(): FieldTypeRegistry | null {
  return _cache;
}

export function isCompoundField(type: string): boolean {
  return !!_cache?.compound_types[type];
}

export function getCompoundDef(type: string): CompoundFieldDef | undefined {
  return _cache?.compound_types[type];
}

export function getCompoundDefault(type: string): Record<string, any> {
  return _cache?.compound_types[type]?.default ?? {};
}
