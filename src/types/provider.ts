import type { ReasoningEffort } from '../core/reasoningEffort';

import { ApiProfile } from './apiProfile';
import { ChatMessage } from './session';

export type ProviderErrorCode =
  | 'AUTH_FAILED'       // 401
  | 'FORBIDDEN'         // 403
  | 'NOT_FOUND'         // 404
  | 'RATE_LIMITED'      // 429
  | 'SERVER_ERROR'      // 5xx
  | 'CORS_ERROR'        // Browser CORS blockage
  | 'NETWORK_ERROR'     // Connection refused / offline
  | 'INVALID_URL'       // Protocol or hostname error
  | 'INVALID_PARAM'     // Invalid request parameter
  | 'TIMEOUT'           // Request timed out
  | 'PARSE_ERROR'       // Malformed JSON/SSE
  | 'ABORTED';          // User cancelled

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  statusCode?: number;
  details?: string;
  isRetryable: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  supportedReasoningEfforts?: ReasoningEffort[];
}

export interface StreamChatParams {
  profile: ApiProfile;
  apiKey?: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onChunk?: (chunkText: string, accumulated: string) => void;
}

export interface ILlmProvider {
  testConnection(profile: ApiProfile, apiKey?: string): Promise<{ success: boolean; latencyMs?: number; error?: ProviderError }>;
  listModels(profile: ApiProfile, apiKey?: string): Promise<ModelInfo[]>;
  chat(params: StreamChatParams): Promise<string>;
}
