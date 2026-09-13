import { db } from './db';
import { ApiProfile, ModelCacheItem } from '../types/apiProfile';
import { inMemoryKeyStore } from '../security/inMemoryKeyStore';
import { maskSecrets } from '../security/masking';

const withMemoryCredentials = (profile: ApiProfile): ApiProfile => {
  if (profile.rememberKey) return profile;
  const apiKey = inMemoryKeyStore.get(profile.id);
  const headers = inMemoryKeyStore.getHeaders(profile.id);
  return {
    ...profile,
    apiKey: apiKey || profile.apiKey,
    headers: headers || profile.headers,
  };
};

export const apiProfileRepo = {
  async getAll(): Promise<ApiProfile[]> {
    const profiles = await db.apiProfiles.toArray();
    return profiles.map(withMemoryCredentials);
  },

  async getById(id: string): Promise<ApiProfile | undefined> {
    const profile = await db.apiProfiles.get(id);
    return profile ? withMemoryCredentials(profile) : undefined;
  },

  async save(profile: ApiProfile): Promise<void> {
    if (!profile.rememberKey) {
      inMemoryKeyStore.set(profile.id, profile.apiKey || '');
      inMemoryKeyStore.setHeaders(profile.id, profile.headers || []);
    }
    const toSave: ApiProfile = {
      ...profile,
      apiKey: profile.rememberKey ? profile.apiKey : undefined,
      headers: profile.rememberKey
        ? profile.headers
        : (profile.headers || []).map(({ key }) => ({ key, value: '' })),
      updatedAt: Date.now(),
    };
    await db.apiProfiles.put(toSave);
  },

  async delete(id: string): Promise<void> {
    await db.transaction('rw', db.apiProfiles, db.modelCache, async () => {
      await db.apiProfiles.delete(id);
      await db.modelCache.where('apiProfileId').equals(id).delete();
    });
  },


  async getCachedModels(apiProfileId: string): Promise<ModelCacheItem[]> {
    const models = await db.modelCache.where('apiProfileId').equals(apiProfileId).toArray();
    const profile = await apiProfileRepo.getById(apiProfileId);
    const secrets = profile ? [profile.apiKey, ...(profile.headers || []).map((header) => header.value)] : [];
    return models.map((model) => ({
      ...model,
      id: maskSecrets(model.id, secrets),
      modelId: maskSecrets(model.modelId, secrets),
      displayName: maskSecrets(model.displayName, secrets),
    }));
  },

  async saveCachedModels(apiProfileId: string, models: Array<{ id: string; name: string }>): Promise<void> {
    const now = Date.now();
    const profile = await apiProfileRepo.getById(apiProfileId);
    const secrets = profile ? [profile.apiKey, ...(profile.headers || []).map((header) => header.value)] : [];
    await db.transaction('rw', db.modelCache, async () => {
      await db.modelCache.where('apiProfileId').equals(apiProfileId).delete();
      const items: ModelCacheItem[] = models.map((m) => ({
        id: `${apiProfileId}:${maskSecrets(m.id, secrets)}`,
        apiProfileId,
        modelId: maskSecrets(m.id, secrets),
        displayName: maskSecrets(m.name || m.id, secrets),
        fetchedAt: now,
      }));
      await db.modelCache.bulkPut(items);
    });
  },
};
