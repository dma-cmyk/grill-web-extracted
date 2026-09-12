/**
 * In-memory temporary key store for API profiles where rememberKey is false.
 * Keys are never written to IndexedDB or localStorage.
 */

class InMemoryKeyStore {
  private keys: Map<string, string> = new Map();

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
  }

  clear(): void {
    this.keys.clear();
  }
}

export const inMemoryKeyStore = new InMemoryKeyStore();
