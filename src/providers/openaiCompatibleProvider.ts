import { ILlmProvider, ModelInfo, ProviderError, ProviderErrorCode, StreamChatParams } from '../types/provider';
import { ApiProfile } from '../types/apiProfile';
import { sanitizeErrorDetails, sanitizeHeaders, validateBaseUrl } from '../security/masking';
import { processSseStream } from './sseStream';

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
    const cleanMsg = sanitizeErrorDetails(rawMsg, secretList);

    if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError') || rawMsg.includes('CORS')) {
      return {
        code: 'CORS_ERROR',
        message: '通信に失敗しました。接続先サーバーがブラウザからのCORS (Cross-Origin Resource Sharing) を許可していないか、URLが正しくありません。',
        details: cleanMsg,
        isRetryable: true,
      };
    }

    return {
      code: 'NETWORK_ERROR',
      message: `通信エラー: ${cleanMsg}`,
      details: cleanMsg,
      isRetryable: true,
    };
  }

  async testConnection(
    profile: ApiProfile,
    apiKey?: string
  ): Promise<{ success: boolean; latencyMs?: number; error?: ProviderError }> {
    const urlValidation = validateBaseUrl(profile.baseUrl);
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
    const secrets = [apiKey || '', profile.apiKey || ''];

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
    const cleanUrl = this.normalizeUrl(profile.baseUrl);
    const modelsEndpoint = `${cleanUrl}/models`;
    const secrets = [apiKey || '', profile.apiKey || ''];

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
          id: m.id || String(m),
          name: m.id || m.name || String(m),
        }));
      } else if (Array.isArray(json.models)) {
        return json.models.map((m: any) => ({
          id: m.id || m.name || String(m),
          name: m.displayName || m.name || m.id || String(m),
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
    const cleanUrl = this.normalizeUrl(profile.baseUrl);
    const completionsEndpoint = `${cleanUrl}/chat/completions`;
    const secrets = [apiKey || '', profile.apiKey || ''];

    const formattedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

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
      if (contentType.includes('text/event-stream') || response.body) {
        try {
          const streamResult = await processSseStream(
            response,
            (chunk, accumulated) => {
              if (onChunk) onChunk(chunk, accumulated);
            },
            signal
          );
          return streamResult;
        } catch (streamErr: any) {
          if (streamErr.name === 'AbortError') throw streamErr;
          // If streaming failed early, attempt non-stream parse
        }
      }

      // Non-stream fallback or plain JSON
      const json = await response.json();
      const content = json.choices?.[0]?.message?.content || '';
      if (onChunk) onChunk(content, content);
      return content;
    } catch (err: any) {
      if (err.code) throw err;
      throw this.classifyError(err, undefined, secrets);
    }
  }
}

export const openAICompatibleProvider = new OpenAICompatibleProvider();
