import { ChatMessage, SelectionSnapshot } from '../types/session';
import { QuestionAnswer } from '../types/grillRound';

export function getDepthInstruction(depth: SelectionSnapshot['depth']): string {
  switch (depth) {
    case 'quick':
      return '【深度設定: Quick】素早く1〜2ラウンド以内で主要な要件を固め、速やかに finished: true としてください。';
    case 'deep':
      return '【深度設定: Deep】4〜6ラウンドかけて、エッジケース、セキュリティ、非機能要件、競合を徹底的に掘り下げてください。';
    case 'standard':
    default:
      return '【深度設定: Standard】2〜3ラウンド程度でバランスよく要件、制約、設計方針を整理し、合意が得られたら finished: true に移行してください。';
  }
}

/**
 * Builds initial messages to start a grill session
 */
export function buildInitialMessages(
  theme: string,
  snapshot: SelectionSnapshot,
  systemPromptTemplate: string
): ChatMessage[] {
  const depthInstruction = getDepthInstruction(snapshot.depth);
  const now = Date.now();

  const systemContent = `${systemPromptTemplate.trim()}

${depthInstruction}
ユーザーから提示された以下のテーマを精査し、Round 1 の質問と現状分析をJSON形式で返してください。`;

  const userContent = `【検討したいテーマ・構想】
${theme.trim()}`;

  return [
    {
      role: 'system',
      content: systemContent,
      timestamp: now,
    },
    {
      role: 'user',
      content: userContent,
      timestamp: now + 1,
    },
  ];
}

/**
 * Builds user reply message for a given round of answers
 */
export function buildAnswersMessage(round: number, answers: QuestionAnswer[]): string {
  const answerLines = answers.map((a, idx) => {
    let chosen = '';
    if (a.useRecommended) {
      chosen = `[推奨回答を採用] ${a.selectedOption || a.customAnswer || '推奨をそのまま承認'}`;
    } else if (a.customAnswer) {
      chosen = `[自由回答] ${a.customAnswer}`;
    } else if (a.selectedOption) {
      chosen = `[選択肢回答] ${a.selectedOption}`;
    } else {
      chosen = '[回答なし/現状おまかせ]';
    }

    return `問${idx + 1} (${a.question}):
-> 回答: ${chosen}`;
  });

  return `【Round ${round} への回答】
${answerLines.join('\n\n')}

上記回答を反映し、確定事項(decisions)や未解決事項(openIssues)を更新した上で、次のRoundの質問または完了(finished: true)の判定を行い、指定のJSONで出力してください。`;
}
