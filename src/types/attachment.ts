export interface AttachmentDraft {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'image' | 'text';
  file: File;
  textPreview?: string;
}

export interface AttachmentRecord {
  id: string;
  sessionId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'image' | 'text';
  blob: Blob;
  createdAt: number;
}
