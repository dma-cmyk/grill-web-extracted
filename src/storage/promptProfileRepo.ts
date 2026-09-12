import { db, DEFAULT_PROMPT_PROFILES } from './db';
import { PromptProfile } from '../types/promptProfile';

export const promptProfileRepo = {
  async getAll(): Promise<PromptProfile[]> {
    const list = await db.promptProfiles.toArray();
    if (list.length === 0) {
      await db.promptProfiles.bulkAdd(DEFAULT_PROMPT_PROFILES);
      return DEFAULT_PROMPT_PROFILES;
    }
    return list;
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
