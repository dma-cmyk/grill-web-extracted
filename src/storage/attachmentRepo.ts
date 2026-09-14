import { db } from './db';
import { AttachmentDraft, AttachmentRecord } from '../types/attachment';

export const attachmentRepo = {
  async saveMany(sessionId: string, drafts: AttachmentDraft[]): Promise<void> {
    const createdAt = Date.now();
    const records: AttachmentRecord[] = drafts.map((draft) => ({
      id: draft.id,
      sessionId,
      name: draft.name,
      mimeType: draft.mimeType,
      sizeBytes: draft.sizeBytes,
      kind: draft.kind,
      blob: draft.file,
      createdAt,
    }));
    await db.attachments.bulkPut(records);
  },

  async listBySession(sessionId: string): Promise<AttachmentRecord[]> {
    const records = await db.attachments.where('sessionId').equals(sessionId).toArray();
    return records.sort((a, b) => a.createdAt - b.createdAt);
  },

  async delete(id: string): Promise<void> {
    await db.attachments.delete(id);
  },

  async deleteBySession(sessionId: string): Promise<void> {
    await db.attachments.where('sessionId').equals(sessionId).delete();
  },
};
