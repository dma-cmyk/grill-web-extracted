export const ALLOWED_IMAGE_MIME_TYPES: string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export const ALLOWED_TEXT_MIME_TYPES: string[] = [
  'text/markdown',
  'text/html',
  'text/plain',
];

export const ALLOWED_TEXT_EXTENSIONS: string[] = [
  '.md',
  '.markdown',
  '.html',
  '.htm',
  '.txt',
];

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 6;

export const ATTACHMENT_ACCEPT_ATTRIBUTE = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_TEXT_MIME_TYPES,
  ...ALLOWED_TEXT_EXTENSIONS,
].join(',');

interface AttachmentValidationResult {
  valid: boolean;
  kind?: 'image' | 'text';
  error?: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

export function describeAttachmentLimits(): string {
  return `対応画像形式: PNG、JPEG、WebP、GIF。テキスト形式: Markdown、HTML、プレーンテキスト（${ALLOWED_TEXT_EXTENSIONS.join('、')}）。1件あたりの上限: 画像${formatBytes(MAX_IMAGE_BYTES)}、テキスト${formatBytes(MAX_TEXT_BYTES)}。合計${formatBytes(MAX_TOTAL_BYTES)}、最大${MAX_ATTACHMENT_COUNT}件。`;
}

function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : '';
}

export function validateAttachmentFile(
  file: File,
  currentTotalBytes: number,
  currentCount: number,
): AttachmentValidationResult {
  const mimeType = (file.type || '').toLowerCase();
  const imageAllowed = ALLOWED_IMAGE_MIME_TYPES.includes(mimeType);
  const textAllowed = ALLOWED_TEXT_EXTENSIONS.includes(getExtension(file.name))
    && (mimeType === '' || ALLOWED_TEXT_MIME_TYPES.includes(mimeType));

  if (!imageAllowed && !textAllowed) {
    return {
      valid: false,
      error: '対応していないファイル形式です。画像はPNG・JPEG・WebP・GIF、テキストはMarkdown・HTML・プレーンテキストに対応しています。',
    };
  }

  const kind: 'image' | 'text' = imageAllowed ? 'image' : 'text';
  const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `ファイルサイズが上限を超えています（${kind === 'image' ? '画像' : 'テキスト'}は1件あたり${formatBytes(maxBytes)}まで）。`,
    };
  }

  if (currentTotalBytes + file.size > MAX_TOTAL_BYTES) {
    return {
      valid: false,
      error: `添付ファイルの合計サイズが上限を超えています（${formatBytes(MAX_TOTAL_BYTES)}まで）。`,
    };
  }

  if (currentCount >= MAX_ATTACHMENT_COUNT) {
    return {
      valid: false,
      error: `添付ファイルは最大${MAX_ATTACHMENT_COUNT}件までです。`,
    };
  }

  return { valid: true, kind };
}
