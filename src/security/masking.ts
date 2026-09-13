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

/** Replace every occurrence of the supplied secrets without interpreting them as regexes. */
export function maskSecrets(text: string, secrets: Array<string | undefined> = []): string {
  if (!text || secrets.length === 0) return text;
  const unique = Array.from(new Set(secrets.map((secret) => secret?.trim()).filter((secret): secret is string => !!secret)))
    .sort((a, b) => b.length - a.length);
  return unique.reduce((result, secret) => result.replaceAll(secret, maskSecret(secret)), text);
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
    if (k && h.value) {
      result[k] = h.value.trim();
    }
  }
  return result;
}

export function sanitizeErrorDetails(message: string, secrets: string[] = []): string {
  let cleaned = message;
  for (const sec of secrets) {
    if (sec && sec.length > 4) {
      cleaned = cleaned.replaceAll(sec, maskSecret(sec));
    }
  }
  // Generic pattern for Bearer tokens or sk- keys
  cleaned = cleaned.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer ••••••••');
  cleaned = cleaned.replace(/sk-[A-Za-z0-9_\-\.]{10,}/gi, 'sk-••••••••');
  return cleaned;
}
