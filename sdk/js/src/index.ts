import type { CollectionMeta, Document, DashtroClientOptions, RtdbUpdate } from './types';
import { DashtroRtdbClient } from './rtdb';

export type { CollectionMeta, Document, DashtroClientOptions, RtdbUpdate };
export { DashtroRtdbClient };

interface CacheEntry {
  ts: number;
  data: unknown;
}

export class DashtroClient {
  private base: string;
  private apiKey: string;
  private cacheTtl: number;
  private cache = new Map<string, CacheEntry>();

  /** Realtime Database access — user-updatable dynamic content, separate
   *  from the read-oriented, cached document endpoints above. */
  readonly rtdb: DashtroRtdbClient;

  constructor({ baseUrl, projectId, apiKey, workspace = 'production', cacheTtl = 60 }: DashtroClientOptions) {
    this.base = `${baseUrl.replace(/\/$/, '')}/api/sdk/projects/${projectId}/workspace/${workspace}`;
    this.apiKey = apiKey;
    this.cacheTtl = cacheTtl * 1000;
    this.rtdb = new DashtroRtdbClient(baseUrl, projectId, apiKey);
  }

  private async _get<T>(url: string): Promise<T> {
    const entry = this.cache.get(url);
    if (entry && Date.now() - entry.ts < this.cacheTtl) {
      return entry.data as T;
    }
    const res = await fetch(url, { headers: { 'X-API-Key': this.apiKey } });
    if (!res.ok) throw new Error(`Dashtro: ${res.status} ${url}`);
    const data = await res.json();
    this.cache.set(url, { ts: Date.now(), data });
    return data;
  }

  async getCollection(collection: string): Promise<CollectionMeta> {
    return this._get(`${this.base}/collection/${collection}/`);
  }

  async getDocument(collection: string, documentId: string, depth = 3): Promise<Document> {
    return this._get(`${this.base}/collection/${collection}/document/${documentId}/?depth=${depth}`);
  }

  async getAllDocuments(collection: string, depth = 3): Promise<Document[]> {
    const meta = await this.getCollection(collection);
    const results = await Promise.allSettled(
      meta._document_ids.map(id => this.getDocument(collection, id, depth))
    );
    return results
      .filter((r): r is PromiseFulfilledResult<Document> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  async resolve(url: string): Promise<Document> {
    return this._get(url);
  }

  /** Clear one cached entry by URL, or the entire cache if no URL given. */
  invalidate(url?: string) {
    if (url) this.cache.delete(url);
    else this.cache.clear();
  }
}

export function createClient(options: DashtroClientOptions): DashtroClient {
  return new DashtroClient(options);
}
