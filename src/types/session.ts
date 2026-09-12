import { GrillRound, QuestionAnswer } from './grillRound';

export type GrillStatus =
  | 'draft'
  | 'requesting'
  | 'receiving'
  | 'parsing'
  | 'awaiting_answer'
  | 'completed'
  | 'recoverable_error'
  | 'aborted';

export interface SelectionSnapshot {
  apiProfileId: string;
  apiProfileName: string;
  baseUrl: string;
  modelId: string;
  modelName: string;
  promptProfileId: string;
  promptProfileName: string;
  depth: 'quick' | 'standard' | 'deep';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  rawJson?: string;
  timestamp: number;
}

export interface RoundHistoryEntry {
  round: number;
  grillRound: GrillRound;
  answers?: QuestionAnswer[];
  submittedAt?: number;
}

export interface SessionRecord {
  id: string;
  title: string;
  theme: string;
  status: GrillStatus;
  selectionSnapshot: SelectionSnapshot;
  promptSnapshot: string; // The system prompt snapshot
  messages: ChatMessage[];
  rounds: RoundHistoryEntry[];
  decisions: string[];
  assumptions: string[];
  conflicts: string[];
  openIssues: string[];
  currentRound: number;
  progress: number;
  finalHandoff?: string;
  lastError?: string;
  lastRawResponse?: string;
  createdAt: number;
  updatedAt: number;
}
