import { ILlmProvider, ModelInfo, ProviderError, ProviderErrorCode, StreamChatParams } from '../types/provider';
import { ApiProfile } from '../types/apiProfile';
import { ChatAttachmentPayload, ChatMessage } from '../types/session';
import { formatBytes } from '../core/attachmentValidation';
import { containsShortSecret, maskPlainSecrets, maskSecrets, maskStreamingFragment, maskStreamingText, sanitizeErrorDetails, sanitizeHeaders, validateBaseUrl } from '../security/masking';
import { processSseStream, processSseText } from './sseStream';

type RequestMessagePart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    };

interface RequestMessage {
  role: ChatMessage['role'];
  content: string | RequestMessagePart[];
}

export function toRequestMessages(messages: ChatMessage[]): RequestMessage[] {
  return messages.map((message) => {
    if (!message.attachments?.length) {
      return {
        role: message.role,
        content: message.content,
      };
    }

    const parts: RequestMessagePart[] = [
      {
        type: 'text',
        text: message.content,
      },
    ];

    message.attachments.forEach((attachment: ChatAttachmentPayload) => {
      if (attachment.kind === 'image') {
        parts.push({
          type: 'image_url',
          image_url: {
            url: attachment.dataUrl || '',
          },
        });
        return;
      }

      parts.push({
        type: 'text',
        text: `添付ファイル: ${attachment.name} (${attachment.mimeType}, ${formatBytes(attachment.sizeBytes)})\n${attachment.textContent ?? ''}`,
      });
    });

    return {
      role: message.role,
      content: parts,
    };
  });
}

export class OpenAICompatibleProvider implements ILlmProvider {
  /**
   * Normalizes the base URL, ensuring no trailing slash
   */
  private normalizeUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, '');
  }

  /**
   * Builds request headers with Authorization Bearer and custom headers
   */
  private buildHeaders(profile: ApiProfile, apiKey?: string): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const key = apiKey || profile.apiKey;
    if (key) {
      headers['Authorization'] = `Bearer ${key.trim()}`;
    }

    if (profile.headers && profile.headers.length > 0) {
      const custom = sanitizeHeaders(profile.headers);
      Object.assign(headers, custom);
    }

    return headers;
  }

  /**
   * Translates an HTTP error or fetch exception into a normalized ProviderError
   */
  private classifyError(err: any, statusCode?: number, secretList: string[] = []): ProviderError {
    if (err?.name === 'AbortError') {
      return {
        code: 'ABORTED',
        message: 'リクエストがユーザーにより中断されました',
        isRetryable: true,
      };
    }

    if (statusCode === 401) {
      return {
        code: 'AUTH_FAILED',
        statusCode: 401,
        message: '認証に失敗しました (401 Unauthorized)。APIキーをご確認ください。',
        isRetryable: false,
      };
    }

    if (statusCode === 403) {
      return {
        code: 'FORBIDDEN',
        statusCode: 403,
        message: 'アクセスが拒否されました (403 Forbidden)。権限またはプロジェクト設定をご確認ください。',
        isRetryable: false,
      };
    }

    if (statusCode === 404) {
      return {
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'エンドポイントが見つかりません (404 Not Found)。Base URL (例: https://api.openai.com/v1) をご確認ください。',
        isRetryable: false,
      };
    }

    if (statusCode === 429) {
      return {
        code: 'RATE_LIMITED',
        statusCode: 429,
        message: 'レートリミットまたは利用可能枠を超過しました (429 Too Many Requests)。少し時間を置いて再試行してください。',
        isRetryable: true,
      };
    }

    if (statusCode && statusCode >= 500) {
      return {
        code: 'SERVER_ERROR',
        statusCode,
        message: `APIサーバー側で内部エラーが発生しました (${statusCode})。一時的な障害の可能性があります。`,
        isRetryable: true,
      };
    }

    // Network / CORS / Browser fetch errors
    const rawMsg = String(err?.message || err || '');
    const hasShortSecret = containsShortSecret(rawMsg, secretList);
    const cleanMsg = hasShortSecret ? '' : sanitizeErrorDetails(rawMsg, secretList);

    if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError') || rawMsg.includes('CORS')) {
      return {
        code: 'CORS_ERROR',
        message: '通信に失敗しました。接続先サーバーがブラウザからのCORS (Cross-Origin Resource Sharing) を許可していないか、URLが正しくありません。',
        ...(cleanMsg ? { details: cleanMsg } : {}),
        isRetryable: true,
      };
    }

    return {
      code: 'NETWORK_ERROR',
      message: cleanMsg ? `通信エラー: ${cleanMsg}` : '通信エラーが発生しました。',
      ...(cleanMsg ? { details: cleanMsg } : {}),
      isRetryable: true,
    };

  }
  private extractContent(json: unknown): string {
    if (!json || typeof json !== 'object' || !('choices' in json)) {
      return '';
    }

    const choices: unknown[] = Array.isArray(json.choices) ? json.choices : [];
    const firstChoice = choices[0];
    if (!firstChoice || typeof firstChoice !== 'object') {
      return '';
    }

    const message = 'message' in firstChoice ? firstChoice.message : undefined;
    const messageContent =
      message &&
      typeof message === 'object' &&
      'content' in message &&
      typeof message.content === 'string'
        ? message.content
        : '';
    const textContent = 'text' in firstChoice && typeof firstChoice.text === 'string' ? firstChoice.text : '';

    return messageContent || textContent || '';
  }


  async testConnection(
    profile: ApiProfile,
    apiKey?: string
  ): Promise<{ success: boolean; latencyMs?: number; error?: ProviderError }> {
    const hasCredentials = !!apiKey?.trim() || !!profile.apiKey?.trim() || (profile.headers || []).some((header) => !!header.value.trim());
    const urlValidation = validateBaseUrl(profile.baseUrl, hasCredentials);
    if (!urlValidation.valid) {
      return {
        success: false,
        error: {
          code: 'INVALID_URL',
          message: urlValidation.error || '無効なURLです',
          isRetryable: false,
        },
      };
    }

    const start = performance.now();
    const cleanUrl = this.normalizeUrl(profile.baseUrl);
    const modelsEndpoint = `${cleanUrl}/models`;
    const secrets = [apiKey || '', profile.apiKey || '', ...(profile.headers?.map((header) => header.value) || [])];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: this.buildHeaders(profile, apiKey),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Math.round(performance.now() - start);

      if (!response.ok) {
        const error = this.classifyError(null, response.status, secrets);
        return { success: false, latencyMs, error };
      }

      return { success: true, latencyMs };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: '接続テストがタイムアウトしました (12秒)',
            isRetryable: true,
          },
        };
      }
      return {
        success: false,
        error: this.classifyError(err, undefined, secrets),
      };
    }
  }

  async listModels(profile: ApiProfile, apiKey?: string): Promise<ModelInfo[]> {
    const hasCredentials = !!apiKey?.trim() || !!profile.apiKey?.trim() || (profile.headers || []).some((header) => !!header.value.trim());
    const urlValidation = validateBaseUrl(profile.baseUrl, hasCredentials);
    if (!urlValidation.valid) {
      const error: ProviderError = {
        code: 'INVALID_URL',
        message: urlValidation.error || '無効なURLです',
        isRetryable: false,
      };
      throw error;
    }
    const cleanUrl = this.normalizeUrl(profile.baseUrl);
    const modelsEndpoint = `${cleanUrl}/models`;
    const secrets = [apiKey?.trim() || '', profile.apiKey?.trim() || '', ...(profile.headers?.map((header) => header.value.trim()) || [])];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: this.buildHeaders(profile, apiKey),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw this.classifyError(null, response.status, secrets);
      }

      const json = await response.json();
      if (Array.isArray(json.data)) {
        return json.data.map((m: any) => ({
          id: maskPlainSecrets(m.id || String(m), secrets),
          name: maskPlainSecrets(m.id || m.name || String(m), secrets),
        }));
      } else if (Array.isArray(json.models)) {
        return json.models.map((m: any) => ({
          id: maskPlainSecrets(m.id || m.name || String(m), secrets),
          name: maskPlainSecrets(m.displayName || m.name || m.id || String(m), secrets),
        }));
      }

      return [];
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.code) throw err;
      throw this.classifyError(err, undefined, secrets);
    }
  }

  async chat(params: StreamChatParams): Promise<string> {
    const { profile, apiKey, model, messages, signal, onChunk } = params;
    const hasCredentials = !!apiKey?.trim() || !!profile.apiKey?.trim() || (profile.headers || []).some((header) => !!header.value.trim());
    const urlValidation = validateBaseUrl(profile.baseUrl, hasCredentials);
    if (!urlValidation.valid) {
      const error: ProviderError = {
        code: 'INVALID_URL',
        message: urlValidation.error || '無効なURLです',
        isRetryable: false,
      };
      throw error;
    }
    const cleanUrl = this.normalizeUrl(profile.baseUrl);
    const completionsEndpoint = `${cleanUrl}/chat/completions`;
    const secrets = [
      apiKey?.trim() || '',
      profile.apiKey?.trim() || '',
      ...(profile.headers?.map((header) => header.value.trim()) || []),
    ];

    const formattedMessages = toRequestMessages(messages);

    const payload = {
      model,
      messages: formattedMessages,
      temperature: 0.7,
      stream: true,
    };

    try {
      const response = await fetch(completionsEndpoint, {
        method: 'POST',
        headers: this.buildHeaders(profile, apiKey),
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        let errBody = '';
        try {
          errBody = await response.text();
        } catch {
          // ignore
        }
        throw this.classifyError(errBody, response.status, secrets);
      }

      // Check if response is stream or direct JSON
      const contentType = response.headers.get('content-type') || '';
      if (contentType.toLowerCase().includes('text/event-stream')) {
        try {
          const streamResult = await processSseStream(
            response,
            (chunk, accumulated) => {
              if (onChunk) onChunk(maskStreamingFragment(chunk, secrets), maskStreamingText(accumulated, secrets));
            },
            signal
          );
          return maskSecrets(streamResult, secrets);
        } catch (streamErr: unknown) {
          if (
            streamErr &&
            typeof streamErr === 'object' &&
            'name' in streamErr &&
            streamErr.name === 'AbortError'
          ) {
            throw streamErr;
          }
          // If streaming failed early, attempt non-stream parse
        }
      }

      const text = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        const hasDataLine = text.split('\n').some((line) => line.trim().startsWith('data:'));
        if (hasDataLine) {
          const streamed = processSseText(text, (chunk, accumulated) => {
            if (onChunk) onChunk(maskStreamingFragment(chunk, secrets), maskStreamingText(accumulated, secrets));
          });
          return maskSecrets(streamed, secrets);
        }

        const hasShortSecret = containsShortSecret(text, secrets);
        const preview = hasShortSecret ? '' : sanitizeErrorDetails(text, secrets).slice(0, 200);
        const parseError: ProviderError = {
          code: 'PARSE_ERROR',
          message: preview ? `API応答の形式を判別できませんでした。本文: ${preview}` : 'API応答の形式を判別できませんでした。',
          ...(preview ? { details: preview } : {}),
          isRetryable: true,
        };
        throw parseError;
      }
      const content = maskSecrets(this.extractContent(json), secrets);
      if (onChunk) onChunk(content, content);
      return content;
    } catch (err: any) {
      if (err.code) throw err;
      throw this.classifyError(err, undefined, secrets);
    }
  }
}

export const openAICompatibleProvider = new OpenAICompatibleProvider();
