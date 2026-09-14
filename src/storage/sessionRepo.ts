import { db } from './db';
import { SessionRecord } from '../types/session';

export const sessionRepo = {
  async getAll(): Promise<SessionRecord[]> {
    return db.sessions.orderBy('updatedAt').reverse().toArray();
  },

  async getById(id: string): Promise<SessionRecord | undefined> {
    return db.sessions.get(id);
  },

  async save(session: SessionRecord): Promise<void> {
    await db.sessions.put({
      ...session,
      updatedAt: Date.now(),
    });
  },
  async normalizeTransientStatuses(): Promise<void> {
    const sessions = await db.sessions.toArray();
    for (const session of sessions) {
      if (session.status !== 'requesting' && session.status !== 'receiving' && session.status !== 'parsing') {
        continue;
      }
      await this.save({
        ...session,
        status: 'aborted',
        lastError: 'リロードにより実行中のリクエストが中断されました',
      });
    }
  },

  async delete(id: string): Promise<void> {
    await db.sessions.delete(id);
  },

  async search(query: string): Promise<SessionRecord[]> {
    const q = query.trim().toLowerCase();
    if (!q) return this.getAll();

    const all = await this.getAll();
    return all.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.theme.toLowerCase().includes(q) ||
        s.selectionSnapshot.modelName.toLowerCase().includes(q) ||
        s.decisions.some((d) => d.toLowerCase().includes(q))
    );
  },
};
