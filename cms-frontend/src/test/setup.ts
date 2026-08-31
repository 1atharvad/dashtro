import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Node 20+'s native `localStorage` global (gated behind --localstorage-file)
// takes precedence over jsdom's implementation and throws when accessed, so
// swap in an in-memory stub for tests that touch localStorage.
if (typeof globalThis.localStorage === 'undefined' || !('getItem' in globalThis.localStorage)) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  });
}
