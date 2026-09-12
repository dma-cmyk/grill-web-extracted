import { SessionRecord } from '../types/session';

/**
 * Ensures or formats an Agent Handoff Prompt with all required sections:
 * - Goal・目的
 * - 決定事項 (Decisions)
 * - 要件定義 (Requirements)
 * - 制約条件・スコープ外 (Constraints & Non-goals)
 * - 推奨技術構成・実装計画 (Implementation Plan)
 * - 受入条件 (DoD / Acceptance Criteria)
 * - 残存する未解決事項 (Open Issues)
 */
export function generateAgentHandoffPrompt(session: SessionRecord): string {
  if (session.finalHandoff && session.finalHandoff.trim().length > 100) {
    return session.finalHandoff.trim();
  }

  const decisionsList = session.decisions.length > 0
    ? session.decisions.map((d) => `- ${d}`).join('\n')
    : '- 現時点で合意された基本スコープを優先';

  const assumptionsList = session.assumptions.length > 0
    ? session.assumptions.map((a) => `- ${a}`).join('\n')
    : '- 通常のWebブラウザ環境で単体動作可能なこと';

  const conflictsList = session.conflicts.length > 0
    ? session.conflicts.map((c) => `- ${c}`).join('\n')
    : '- なし';

  const openIssuesList = session.openIssues.length > 0
    ? session.openIssues.map((o) => `- ${o}`).join('\n')
    : '- なし (現ラウンドにて解決完了)';

  const roundsSummary = session.rounds
    .map((r, i) => {
      const qSummary = r.grillRound.questions
        .map((q, qIdx) => {
          const ans = r.answers?.[qIdx];
          const ansText = ans?.useRecommended
            ? `(推奨承認) ${q.recommendedAnswer}`
            : ans?.customAnswer || ans?.selectedOption || '(回答なし)';
          return `  - Q: ${q.question}\n    A: ${ansText}`;
        })
        .join('\n');
      return `### Round ${r.round}\n${qSummary}`;
    })
    .join('\n\n');

  return `# ${session.title || 'プロジェクト'} 実装要件定義書 (Agent Handoff Prompt)

> 本プロンプトは Grill-Web による多面的要件定義セッションの結果をもとに生成された、下流AIコーディングエージェント向けの実行用プロンプトです。

---

## 1. ゴール・目的
${session.theme}

## 2. 決定事項 (Decisions)
${decisionsList}

## 3. 前提条件・仮定 (Assumptions)
${assumptionsList}

## 4. トレードオフ・調整事項 (Resolved Conflicts)
${conflictsList}

## 5. 制約条件・スコープ外 (Constraints & Non-goals)
- 本リリースでは過剰な汎用化や追加機能の実装を避け、上記「決定事項」に記載されたMVPスコープの完成を最優先とする。
- 外部システムへの不要な依存を排し、安全かつ堅牢な実装とすること。

## 6. 推奨技術構成・実装計画 (Implementation Plan)
1. **基盤・モデル層の作成**: データ構造、型定義、状態遷移の厳格な実装
2. **ロジック・サービス層**: エラー耐性、例外ハンドリング、境界チェック
3. **UI / インタラクション層**: 視認性と操作性を担保したアクセシブルな画面
4. **統合テスト・受入検証**: 下記の受入条件を網羅する検証

## 7. 受入条件 (Definition of Done)
- [ ] 決定事項に挙げられたすべての機能がエンドツーエンドで動作すること
- [ ] 予期せぬエラーや不正入力時にもユーザーにわかりやすいフィードバックがあること
- [ ] 不要な外部送信や秘密情報の漏洩がないこと

## 8. 残存する未解決事項・将来の課題 (Open Issues)
${openIssuesList}

---

## 付録: 要件ヒアリング履歴
${roundsSummary}
`;
}
