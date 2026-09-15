import Dexie, { Table } from 'dexie';
import { ApiProfile, ModelCacheItem } from '../types/apiProfile';
import { PromptProfile } from '../types/promptProfile';
import { BUILTIN_PROMPT_SEED_VERSION, DEFAULT_PROMPT_PROFILES } from './defaultPromptProfiles';
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

const BUILTIN_PROMPT_SEED_VERSION_KEY = 'builtinPromptSeedVersion';

/**
 * 不足している組み込み Prompt Profile だけを追加し、シードバージョンを記録する。
 * 既存レコード(ユーザーが手を入れた組み込み・カスタム)は更新も上書きもしない。
 */
export async function ensureDatabaseInitialized(): Promise<void> {
  await db.transaction('rw', db.promptProfiles, db.settings, async () => {
    const existing = await db.promptProfiles.bulkGet(DEFAULT_PROMPT_PROFILES.map((profile) => profile.id));
    const missing = DEFAULT_PROMPT_PROFILES.filter((_, index) => existing[index] === undefined);
    if (missing.length > 0) {
      await db.promptProfiles.bulkAdd(missing);
    }
    const recorded = await db.settings.get(BUILTIN_PROMPT_SEED_VERSION_KEY);
    if (recorded?.value !== BUILTIN_PROMPT_SEED_VERSION) {
      await db.settings.put({ key: BUILTIN_PROMPT_SEED_VERSION_KEY, value: BUILTIN_PROMPT_SEED_VERSION });
    }
  });
}

/** Deletes the local database so initialization can be retried from a clean state. */
export async function resetDatabase(): Promise<void> {
  await db.delete();
  await db.open();
}
