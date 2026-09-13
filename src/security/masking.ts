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

type SecretEntry = { secret: string; mask: string };

function buildSecretEntries(secrets: Array<string | undefined>): SecretEntry[] {
  return Array.from(new Set(secrets.map((secret) => secret?.trim()).filter((secret): secret is string => !!secret)))
    .sort((a, b) => b.length - a.length)
    .map((secret) => ({ secret, mask: maskSecret(secret) }));
}

function maskDecodedText(text: string, entries: SecretEntry[]): string {
  if (!text || entries.length === 0) return text;
  let result = '';
  let index = 0;
  while (index < text.length) {
    const existing = entries.find(({ mask }) => text.startsWith(mask, index));
    if (existing) { result += existing.mask; index += existing.mask.length; continue; }
    const match = entries.find(({ secret }) => text.startsWith(secret, index));
    if (match) { result += match.mask; index += match.secret.length; continue; }
    result += text[index++];
  }
  return result;
}

interface JsonStringScan {
  decoded: string;
  rawOffsets: Array<[number, number]>;
  complete: boolean;
  end: number;
  tailStart: number;
}

function scanJsonString(text: string, openQuoteIndex: number): JsonStringScan {
  const rawOffsets: Array<[number, number]> = [];
  let decoded = '';
  let index = openQuoteIndex + 1;
  let tailStart = text.length;
  while (index < text.length) {
    const start = index;
    const char = text[index++];
    if (char === '"') { tailStart = start; return { decoded, rawOffsets, complete: true, end: index, tailStart }; }
    if (char !== '\\') {
      decoded += char;
      rawOffsets.push([start, index]);
      continue;
    }
    if (index >= text.length) { tailStart = start; break; }
    const escape = text[index++];
    const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
    if (escape in simple) {
      decoded += simple[escape];
      rawOffsets.push([start, index]);
      continue;
    }
    if (escape === 'u' && index + 4 <= text.length && /^[0-9a-fA-F]{4}$/.test(text.slice(index, index + 4))) {
      decoded += String.fromCharCode(parseInt(text.slice(index, index + 4), 16));
      index += 4;
      rawOffsets.push([start, index]);
      continue;
    }
    tailStart = start;
    break;
  }
  return { decoded, rawOffsets, complete: false, end: text.length, tailStart };
}

function maskStringTokenBody(text: string, scan: JsonStringScan, entries: SecretEntry[]): { out: string; changed: boolean } {
  if (scan.decoded.length === 0 || entries.length === 0) {
    return { out: scan.complete ? '' : text.slice(scan.tailStart), changed: false };
  }
  let out = '';
  let decodedIndex = 0;
  let rawIndex = scan.rawOffsets[0]?.[0] ?? scan.tailStart;
  let changed = false;
  while (decodedIndex < scan.decoded.length) {
    const existing = entries.find(({ mask }) => scan.decoded.startsWith(mask, decodedIndex));
    const match = existing || entries.find(({ secret }) => scan.decoded.startsWith(secret, decodedIndex));
    if (match) {
      const length = existing ? match.mask.length : match.secret.length;
      const end = decodedIndex + length;
      if (existing) {
        out += text.slice(rawIndex, scan.rawOffsets[end - 1][1]);
      } else {
        out += JSON.stringify(match.mask).slice(1, -1);
        changed = true;
      }
      rawIndex = scan.rawOffsets[end - 1][1];
      decodedIndex = end;
      continue;
    }
    const span = scan.rawOffsets[decodedIndex];
    out += text.slice(span[0], span[1]);
    rawIndex = span[1];
    decodedIndex += 1;
  }
  out += text.slice(rawIndex, scan.tailStart);
  if (!scan.complete) out += text.slice(scan.tailStart);
  return { out, changed };
}

export function maskPlainSecrets(text: string, secrets: Array<string | undefined> = []): string {
  return maskDecodedText(text, buildSecretEntries(secrets));
}

/** Mask only JSON/SSE string value tokens, preserving keys and wire structure. */
export function maskSecrets(text: string, secrets: Array<string | undefined> = []): string {
  if (!text || secrets.length === 0) return text;
  const entries = buildSecretEntries(secrets);
  let result = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '"') { result += text[index++]; continue; }
    const start = index;
    const scan = scanJsonString(text, start);
    if (!scan.complete) { result += text.slice(start); break; }
    const rawToken = text.slice(start, scan.end);
    let cursor = scan.end;
    while (/\s/.test(text[cursor] || '')) cursor += 1;
    if (text[cursor] === ':') { result += rawToken; index = scan.end; continue; }
    const masked = maskStringTokenBody(text, scan, entries);
    result += masked.changed ? `"${masked.out}"` : rawToken;
    index = scan.end;
  }
  return result;
}

/** Mask partial/non-JSON response text without rewriting its syntax. */
export function maskStreamingText(text: string, secrets: Array<string | undefined> = []): string {
  if (!text || secrets.length === 0) return text;
  const entries = buildSecretEntries(secrets);
  const literalMasked = maskDecodedText(text, entries);
  let result = '';
  let index = 0;
  while (index < literalMasked.length) {
    if (literalMasked[index] !== '"') { result += literalMasked[index++]; continue; }
    const start = index;
    const scan = scanJsonString(literalMasked, start);
    if (scan.complete) {
      let cursor = scan.end;
      while (/\s/.test(literalMasked[cursor] || '')) cursor += 1;
      if (literalMasked[cursor] === ':') { result += literalMasked.slice(start, scan.end); index = scan.end; continue; }
    }
    const masked = maskStringTokenBody(literalMasked, scan, entries);
    result += `"${masked.out}${scan.complete ? '"' : ''}`;
    index = scan.complete ? scan.end : literalMasked.length;
  }
  return result;
}

/** Preserve structured response syntax when possible, otherwise mask plain text. */
export function maskResponseText(text: string, secrets: Array<string | undefined> = []): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  try {
    JSON.parse(trimmed);
    return maskSecrets(text, secrets);
  } catch {
    const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      JSON.parse(fenced);
      return maskSecrets(text, secrets);
    } catch {
      return maskStreamingText(text, secrets);
    }
  }
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
