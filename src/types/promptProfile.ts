export interface PromptProfile {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  builtIn: boolean;
  createdAt: number;
  updatedAt: number;
}
