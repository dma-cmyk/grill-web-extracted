import { db } from './db';
import { ApiProfile, ModelCacheItem } from '../types/apiProfile';

export const apiProfileRepo = {
  async getAll(): Promise<ApiProfile[]> {
    return db.apiProfiles.toArray();
  },

  async getById(id: string): Promise<ApiProfile | undefined> {
    return db.apiProfiles.get(id);
  },

  async save(profile: ApiProfile): Promise<void> {
    const toSave: ApiProfile = {
      ...profile,
      // If rememberKey is false, never persist apiKey to IndexedDB
      apiKey: profile.rememberKey ? profile.apiKey : undefined,
      updatedAt: Date.now(),
    };
    await db.apiProfiles.put(toSave);
  },

  async delete(id: string): Promise<void> {
    // Delete profile and associated model cache only; keep sessions intact
    await db.transaction('rw', db.apiProfiles, db.modelCache, async () => {
      await db.apiProfiles.delete(id);
      await db.modelCache.where('apiProfileId').equals(id).delete();
    });
  },

  async getCachedModels(apiProfileId: string): Promise<ModelCacheItem[]> {
    return db.modelCache.where('apiProfileId').equals(apiProfileId).toArray();
  },

  async saveCachedModels(apiProfileId: string, models: Array<{ id: string; name: string }>): Promise<void> {
    const now = Date.now();
    await db.transaction('rw', db.modelCache, async () => {
      await db.modelCache.where('apiProfileId').equals(apiProfileId).delete();
      const items: ModelCacheItem[] = models.map((m) => ({
        id: `${apiProfileId}:${m.id}`,
        apiProfileId,
        modelId: m.id,
        displayName: m.name || m.id,
        fetchedAt: now,
      }));
      await db.modelCache.bulkPut(items);
    });
  },
};
