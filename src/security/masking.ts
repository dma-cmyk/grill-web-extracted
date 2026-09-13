/**
 * Security and masking utilities
 * Strictly prevents leaking API keys or authorization headers to UI, logs, or exports.
 */

export function maskSecret(secret?: string): string {
  if (!secret) return '';
  const trimmed = secret.trim();
  if (trimmed.length <= 6) {
    return '••••••••';
  }
  const prefix = trimmed.slice(0, 3);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

/** Replace secrets in already-parsed plain values without JSON wire escaping rules. */
export function maskPlainSecrets(text: string, secrets: Array<string | undefined> = []): string {
  if (!text || secrets.length === 0) return text;
  const unique = Array.from(new Set(secrets.map((secret) => secret?.trim()).filter((secret): secret is string => !!secret)))
    .sort((a, b) => b.length - a.length);
  const masks = unique.map((secret) => ({ secret, mask: maskSecret(secret) }));
  let result = '';
  let index = 0;
  while (index < text.length) {
    const existing = masks.find(({ mask }) => text.startsWith(mask, index));
    if (existing) { result += existing.mask; index += existing.mask.length; continue; }
    const match = masks.find(({ secret }) => text.startsWith(secret, index));
    if (match) { result += match.mask; index += match.secret.length; continue; }
    result += text[index++];
  }
  return result;
}

/** Replace secrets in JSON/SSE wire text, preserving structural syntax. */
export function maskSecrets(text: string, secrets: Array<string | undefined> = []): string {
  if (!text || secrets.length === 0) return text;
  const unique = Array.from(new Set(secrets.map((secret) => secret?.trim()).filter((secret): secret is string => !!secret)))
    .sort((a, b) => b.length - a.length);
  const masks = unique.map((secret) => ({ secret, mask: maskSecret(secret), escaped: JSON.stringify(secret).slice(1, -1) }));
  let result = '';
  let index = 0;
  while (index < text.length) {
    const existing = masks.find(({ mask }) => text.startsWith(mask, index));
    if (existing) { result += existing.mask; index += existing.mask.length; continue; }
    let match: { length: number; replacement: string } | undefined;
    for (const { secret, mask, escaped } of masks) {
      if (!/["\\\u0000-\u001f]/.test(secret) && text.startsWith(secret, index) && (!match || secret.length > match.length)) match = { length: secret.length, replacement: mask };
      if (escaped !== secret && text.startsWith(escaped, index) && (!match || escaped.length > match.length)) match = { length: escaped.length, replacement: JSON.stringify(mask).slice(1, -1) };
    }
    if (match) { result += match.replacement; index += match.length; } else result += text[index++];
  }
  return result;
}

export function validateBaseUrl(url: string, hasCredentials: boolean): { valid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URLを入力してください' };
  }
  const trimmed = url.trim();

  // Rejection of embedded credentials (user:pass@host)
  if (trimmed.includes('@')) {
    return { valid: false, error: 'セキュリティ上の理由から、ユーザー認証情報(@)を含むURLは許可されていません' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'プロトコルは http:// または https:// のみ許可されています' };
    }
    if (hasCredentials && parsed.protocol === 'http:') {
      const hostname = parsed.hostname.toLowerCase();
      const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
      if (!isLoopback) {
        return { valid: false, error: '認証情報を含む接続先は HTTPS または loopback の HTTP のみ許可されています' };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, error: '有効なURL形式ではありません (例: https://api.openai.com/v1)' };
  }
}

export function sanitizeHeaders(headers?: Array<{ key: string; value: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;

  for (const h of headers) {
    const k = h.key.trim();
    if (k && h.value) result[k] = h.value.trim();
  }
  return result;
}

export function sanitizeErrorDetails(message: string, secrets: string[] = []): string {
  let cleaned = maskPlainSecrets(message, secrets);
  cleaned = cleaned.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer ••••••••');
  cleaned = cleaned.replace(/sk-[A-Za-z0-9_\-\.]{10,}/gi, 'sk-••••••••');
  return cleaned;
}
