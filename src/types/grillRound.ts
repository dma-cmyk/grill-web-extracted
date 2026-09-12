import { z } from 'zod';

export const QuestionItemSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  question: z.string().min(1, '質問内容は必須です'),
  category: z.string().optional().default('要件'),
  options: z.array(z.string()).optional().default([]),
  recommendedAnswer: z.string().optional().default(''),
  explanation: z.string().optional().default(''),
});

export type QuestionItem = z.infer<typeof QuestionItemSchema>;

export const CompletionStatusSchema = z.object({
  progressPercentage: z.number().min(0).max(100).default(0),
  reasoning: z.string().default(''),
});

export type CompletionStatus = z.infer<typeof CompletionStatusSchema>;

export const GrillRoundSchema = z.object({
  round: z.number().int().min(1),
  questions: z.array(QuestionItemSchema),
  finished: z.boolean(),
  completion: CompletionStatusSchema,
  decisions: z.array(z.string()).optional().default([]),
  assumptions: z.array(z.string()).optional().default([]),
  conflicts: z.array(z.string()).optional().default([]),
  openIssues: z.array(z.string()).optional().default([]),
  finalHandoff: z.string().optional().default(''),
}).passthrough(); // Ignore unknown fields for forward compatibility as stated in section 3.5

export type GrillRound = z.infer<typeof GrillRoundSchema>;

export interface QuestionAnswer {
  questionId: string;
  question: string;
  selectedOption?: string;
  customAnswer?: string;
  useRecommended?: boolean;
}
