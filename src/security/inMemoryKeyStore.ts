/**
 * In-memory temporary key store for API profiles where rememberKey is false.
 * Keys are never written to IndexedDB or localStorage.
 */

import { CustomHeader } from '../types/apiProfile';

interface InMemoryCredentials {
  apiKey?: string;
  headers?: CustomHeader[];
}

class InMemoryKeyStore {
  private keys: Map<string, string> = new Map();
  private headerValues: Map<string, CustomHeader[]> = new Map();

  // Existing API-key methods remain compatible for all callers.
  set(profileId: string, apiKey: string): void {
    if (apiKey) {
      this.keys.set(profileId, apiKey);
    } else {
      this.keys.delete(profileId);
    }
  }

  get(profileId: string): string | undefined {
    return this.keys.get(profileId);
  }

  has(profileId: string): boolean {
    return this.keys.has(profileId);
  }

  delete(profileId: string): void {
    this.keys.delete(profileId);
    this.headerValues.delete(profileId);
  }

  clear(): void {
    this.keys.clear();
    this.headerValues.clear();
  }

  setHeaders(profileId: string, headers: CustomHeader[]): void {
    const values = headers.map(({ key, value }) => ({ key, value }));
    if (values.some(({ value }) => value)) this.headerValues.set(profileId, values);
    else this.headerValues.delete(profileId);
  }

  getHeaders(profileId: string): CustomHeader[] | undefined {
    const headers = this.headerValues.get(profileId);
    return headers?.map(({ key, value }) => ({ key, value }));
  }
}

export const inMemoryKeyStore = new InMemoryKeyStore();
