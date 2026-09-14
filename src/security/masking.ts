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
  termination: 'closed' | 'pending' | 'malformed';
}

function scanJsonString(text: string, openQuoteIndex: number): JsonStringScan {
  const rawOffsets: Array<[number, number]> = [];
  let decoded = '';
  let index = openQuoteIndex + 1;
  let tailStart = text.length;
  while (index < text.length) {
    const start = index;
    const char = text[index++];
    if (char === '"') return { decoded, rawOffsets, complete: true, end: index, tailStart: start, termination: 'closed' };
    if (char !== '\\') {
      decoded += char;
      rawOffsets.push([start, index]);
      continue;
    }
    if (index >= text.length) return { decoded, rawOffsets, complete: false, end: text.length, tailStart: start, termination: 'pending' };
    const escape = text[index++];
    const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
    if (escape in simple) {
      decoded += simple[escape];
      rawOffsets.push([start, index]);
      continue;
    }
    if (escape === 'u') {
      const available = text.slice(index, index + 4);
      if (available.length < 4 && /^[0-9a-fA-F]*$/.test(available)) return { decoded, rawOffsets, complete: false, end: text.length, tailStart: start, termination: 'pending' };
      if (available.length < 4 || !/^[0-9a-fA-F]{4}$/.test(available)) return { decoded, rawOffsets, complete: false, end: text.length, tailStart: start, termination: 'malformed' };
      decoded += String.fromCharCode(parseInt(available, 16));
      index += 4;
      rawOffsets.push([start, index]);
      continue;
    }
    return { decoded, rawOffsets, complete: false, end: text.length, tailStart: start, termination: 'malformed' };
  }
  return { decoded, rawOffsets, complete: false, end: text.length, tailStart: text.length, termination: 'pending' };
}

function maskStringTokenBody(text: string, scan: JsonStringScan, entries: SecretEntry[]): { out: string; changed: boolean } {
  if (scan.decoded.length === 0 || entries.length === 0) return { out: '', changed: false };
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
      if (existing) out += text.slice(rawIndex, scan.rawOffsets[end - 1][1]);
      else { out += JSON.stringify(match.mask).slice(1, -1); changed = true; }
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
  return { out, changed };
}

export function maskPlainSecrets(text: string, secrets: Array<string | undefined> = []): string {
  return maskDecodedText(text, buildSecretEntries(secrets));
}

/** Mask only JSON/SSE string value tokens, preserving keys and wire structure. */
export function maskSecrets(text: string, secrets: Array<string | undefined> = []): string {
  const entries = buildSecretEntries(secrets);
  if (!text || entries.length === 0) return text;
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

function isStructuredStream(text: string): boolean {
  let index = 0;
  while (/\s/.test(text[index] || '')) index += 1;
  if (text.startsWith('```', index)) { const newline = text.indexOf('\n', index + 3); if (newline < 0) return false; index = newline + 1; while (/\s/.test(text[index] || '')) index += 1; }
  return text[index] === '{' || text[index] === '[';
}

function isScalar(run: string, atEnd: boolean): boolean {
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(run) || run === 'true' || run === 'false' || run === 'null') return true;
  return atEnd && (/^-?\d*(\.\d*)?([eE][+-]?\d*)?$/.test(run) || 'true'.startsWith(run) || 'false'.startsWith(run) || 'null'.startsWith(run));
}

function maskStructuredStream(text: string, entries: SecretEntry[]): string {
  const stack: Array<{ object: boolean; expectKey: boolean }> = [];
  let result = '', index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) { result += char; index++; continue; }
    if (char === '"') {
      const scan = scanJsonString(text, index), top = stack[stack.length - 1], isKey = !!top?.object && top.expectKey;
      if (isKey) result += text.slice(index, scan.end);
      else if (scan.termination === 'closed') { const masked = maskStringTokenBody(text, scan, entries); result += masked.changed ? `"${masked.out}"` : text.slice(index, scan.end); }
      else { const masked = maskStringTokenBody(text, scan, entries); result += `"${masked.out}`; result += scan.termination === 'malformed' ? maskDecodedText(text.slice(scan.tailStart), entries) : text.slice(scan.tailStart); }
      index = scan.end; continue;
    }
    if (char === '{') { stack.push({ object: true, expectKey: true }); result += char; index++; continue; }
    if (char === '[') { stack.push({ object: false, expectKey: false }); result += char; index++; continue; }
    if (char === '}' || char === ']') { stack.pop(); result += char; index++; continue; }
    if (char === ':') { if (stack[stack.length - 1]?.object) stack[stack.length - 1].expectKey = false; result += char; index++; continue; }
    if (char === ',') { if (stack[stack.length - 1]?.object) stack[stack.length - 1].expectKey = true; result += char; index++; continue; }
    let end = index; while (end < text.length && !/[\s"{}\[\]:,]/.test(text[end])) end++;
    const run = text.slice(index, end); result += isScalar(run, end === text.length) ? run : maskDecodedText(run, entries); index = end;
  }
  return result;
}
/** Preserve structured response syntax when possible, otherwise mask plain text. */
export function maskStreamingText(text: string, secrets: Array<string | undefined> = []): string {
  const entries = buildSecretEntries(secrets);
  if (!text || entries.length === 0) return text;
  return isStructuredStream(text) ? maskStructuredStream(text, entries) : maskDecodedText(text, entries);
}
export function maskStreamingFragment(text: string, secrets: Array<string | undefined> = []): string {
  if (!text || secrets.length === 0) return text;
  const entries = buildSecretEntries(secrets);
  const findMatch = (start: number, target: string): { end: number; escaped: boolean } | undefined => {
    const raw = text.startsWith(target, start) ? { end: start + target.length, escaped: false } : undefined;
    let decodedRaw = start, decoded = '', escaped = false;
    while (decodedRaw < text.length && decoded.length < target.length) {
      const begin = decodedRaw;
      let value = text[decodedRaw++];
      if (value === '\\' && decodedRaw < text.length) {
        const next = text[decodedRaw];
        const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (next in simple) { value = simple[next]; decodedRaw++; escaped = true; }
        else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(decodedRaw + 1, decodedRaw + 5))) { value = String.fromCharCode(parseInt(text.slice(decodedRaw + 1, decodedRaw + 5), 16)); decodedRaw += 5; escaped = true; }
        else decodedRaw = begin + 1;
      }
      decoded += value;
    }
    const wire = decoded === target ? { end: decodedRaw, escaped } : undefined;
    if (!raw) return wire;
    if (!wire || raw.end - start >= wire.end - start) return raw;
    return wire;
  };
  let result = '', index = 0;
  while (index < text.length) {
    const existing = entries.map((entry) => ({ entry, match: findMatch(index, entry.mask) })).filter((candidate): candidate is { entry: SecretEntry; match: { end: number; escaped: boolean } } => !!candidate.match)
      .sort((a, b) => (b.entry.mask.length - a.entry.mask.length) || ((b.match.end - index) - (a.match.end - index)))[0];
    if (existing) { result += text.slice(index, existing.match.end); index = existing.match.end; continue; }
    const match = entries.map((entry) => ({ entry, match: findMatch(index, entry.secret) })).filter((candidate): candidate is { entry: SecretEntry; match: { end: number; escaped: boolean } } => !!candidate.match)
      .sort((a, b) => (b.entry.secret.length - a.entry.secret.length) || ((b.match.end - index) - (a.match.end - index)))[0];
    if (match) { result += match.match.escaped ? JSON.stringify(match.entry.mask).slice(1, -1) : match.entry.mask; index = match.match.end; }
    else { result += text[index]; index++; }
  }
  return result;
}
/** Preserve structured response syntax when possible, otherwise mask plain text. */
export function maskResponseText(text: string, secrets: Array<string | undefined> = []): string {
  const entries = buildSecretEntries(secrets);
  if (entries.length === 0) return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  try { JSON.parse(trimmed); return maskSecrets(text, secrets); }
  catch {
    const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { JSON.parse(fenced); return maskSecrets(text, secrets); }
    catch { return maskStreamingText(text, secrets); }
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
