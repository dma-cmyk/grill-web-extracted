export interface PromptProfile {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  builtIn: boolean;
  sortOrder?: number;
  createdAt: number;
  updatedAt: number;
}
