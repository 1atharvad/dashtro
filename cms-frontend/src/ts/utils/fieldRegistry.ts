/**
 * Field type registry — fetched from GET /api/cms/field-types/
 * Python (field_types.py) is the single source of truth.
 * Do NOT hardcode types here — add them to the backend registry.
 */

import { API_BASE_URL } from '@ts/config';
import type { CompoundFieldDef, FieldTypeRegistry } from '@ts/types/constants';

let _cache: FieldTypeRegistry | null = null;
const _listeners = new Set<() => void>();

export async function fetchFieldRegistry(): Promise<FieldTypeRegistry> {
  if (_cache) return _cache;
  const res = await fetch(`${API_BASE_URL}/field-types/`);
  _cache = await res.json();
  _listeners.forEach(fn => fn());
  _listeners.clear();
  return _cache!;
}

/** Calls cb once when (or immediately if) the registry is loaded. Returns an unsubscribe fn. */
export function onRegistryReady(cb: () => void): () => void {
  if (_cache) { cb(); return () => {}; }
  _listeners.add(cb);
  return () => _listeners.delete(cb);
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

export function getCompoundDefault(type: string): Record<string, unknown> {
  return _cache?.compound_types[type]?.default ?? {};
}
