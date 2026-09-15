import { db, ensureDatabaseInitialized } from './db';
import { DEFAULT_PROMPT_PROFILES } from './defaultPromptProfiles';
import { PromptProfile } from '../types/promptProfile';

const FALLBACK_SORT_ORDER = 1000;
const BUILTIN_SORT_ORDER: Record<string, number> = Object.fromEntries(
  DEFAULT_PROMPT_PROFILES.map((profile) => [profile.id, profile.sortOrder ?? FALLBACK_SORT_ORDER]),
);

const effectiveSortOrder = (profile: PromptProfile): number =>
  profile.sortOrder ?? BUILTIN_SORT_ORDER[profile.id] ?? FALLBACK_SORT_ORDER;

export function sortPromptProfiles(profiles: PromptProfile[]): PromptProfile[] {
  return [...profiles].sort((a, b) => {
    if (a.builtIn !== b.builtIn) return a.builtIn ? -1 : 1;
    const order = a.builtIn
      ? effectiveSortOrder(a) - effectiveSortOrder(b)
      : (a.createdAt || 0) - (b.createdAt || 0);
    return order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

export const promptProfileRepo = {
  async getAll(): Promise<PromptProfile[]> {
    await ensureDatabaseInitialized();
    return sortPromptProfiles(await db.promptProfiles.toArray());
  },

  async getById(id: string): Promise<PromptProfile | undefined> {
    return db.promptProfiles.get(id);
  },

  async save(prompt: PromptProfile): Promise<void> {
    await db.promptProfiles.put({
      ...prompt,
      updatedAt: Date.now(),
    });
  },

  async clone(sourceId: string, newName?: string): Promise<PromptProfile> {
    const source = await db.promptProfiles.get(sourceId);
    if (!source) throw new Error('複製元プロンプトが見つかりません');

    const newProfile: PromptProfile = {
      id: 'custom-' + Math.random().toString(36).substring(2, 9),
      name: newName || `${source.name} (コピー)`,
      description: source.description,
      systemPrompt: source.systemPrompt,
      builtIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.promptProfiles.add(newProfile);
    return newProfile;
  },

  async delete(id: string): Promise<void> {
    const item = await db.promptProfiles.get(id);
    if (item?.builtIn) {
      throw new Error('組み込みプロンプトは削除できません');
    }
    await db.promptProfiles.delete(id);
  },
};
