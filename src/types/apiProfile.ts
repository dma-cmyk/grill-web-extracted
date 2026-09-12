export interface CustomHeader {
  key: string;
  value: string;
}

export interface ApiProfile {
  id: string;
  name: string;
  baseUrl: string; // e.g. "https://api.openai.com/v1" or "http://localhost:11434/v1"
  apiKey?: string; // Optional if rememberKey is false; if rememberKey is false, might only be kept in memory
  headers?: CustomHeader[];
  rememberKey: boolean; // default false
  createdAt: number;
  updatedAt: number;
}

export interface ModelCacheItem {
  id: string; // composite `${apiProfileId}:${modelId}`
  apiProfileId: string;
  modelId: string;
  displayName: string;
  fetchedAt: number;
}
