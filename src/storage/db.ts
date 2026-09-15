import Dexie, { Table } from 'dexie';
import { ApiProfile, ModelCacheItem } from '../types/apiProfile';
import { PromptProfile } from '../types/promptProfile';
import { DEFAULT_PROMPT_PROFILES } from './defaultPromptProfiles';
import { SessionRecord } from '../types/session';
import { AttachmentRecord } from '../types/attachment';
export interface AppSetting {
  key: string;
  value: any;
}

export class GrillDatabase extends Dexie {
  apiProfiles!: Table<ApiProfile, string>;
  modelCache!: Table<ModelCacheItem, string>;
  promptProfiles!: Table<PromptProfile, string>;
  sessions!: Table<SessionRecord, string>;
  settings!: Table<AppSetting, string>;
  attachments!: Table<AttachmentRecord, string>;

  constructor() {
    super('GrillWebDB');

    // Schema v1 with versioned migration
    this.version(1).stores({
      apiProfiles: 'id, name, baseUrl, rememberKey, createdAt, updatedAt',
      modelCache: 'id, apiProfileId, modelId, fetchedAt',
      promptProfiles: 'id, name, builtIn, createdAt, updatedAt',
      sessions: 'id, title, status, currentRound, progress, createdAt, updatedAt',
      settings: 'key',
    });
    this.version(2).stores({
      apiProfiles: 'id, name, baseUrl, rememberKey, createdAt, updatedAt',
      modelCache: 'id, apiProfileId, modelId, fetchedAt',
      promptProfiles: 'id, name, builtIn, createdAt, updatedAt',
      sessions: 'id, title, status, currentRound, progress, createdAt, updatedAt',
      settings: 'key',
    }).upgrade(async (tx) => {
      await tx.table('apiProfiles').toCollection().modify((profile: ApiProfile) => {
        if (!profile.rememberKey) {
          delete profile.apiKey;
          profile.headers = (profile.headers || []).map(({ key }) => ({ key, value: '' }));
        }
      });
    });
    this.version(3).stores({
      apiProfiles: 'id, name, baseUrl, rememberKey, createdAt, updatedAt',
      modelCache: 'id, apiProfileId, modelId, fetchedAt',
      promptProfiles: 'id, name, builtIn, createdAt, updatedAt',
      sessions: 'id, title, status, currentRound, progress, createdAt, updatedAt',
      settings: 'key',
      attachments: 'id, sessionId, createdAt',
    });
  }
}

export const db = new GrillDatabase();

/**
 * Ensures default prompt profiles are initialized in the database
 */
export async function ensureDatabaseInitialized(): Promise<void> {
  const count = await db.promptProfiles.count();
  if (count === 0) {
    await db.promptProfiles.bulkAdd(DEFAULT_PROMPT_PROFILES);
  }
}

/** Deletes the local database so initialization can be retried from a clean state. */
export async function resetDatabase(): Promise<void> {
  await db.delete();
  await db.open();
}
