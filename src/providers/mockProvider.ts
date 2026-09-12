import { ILlmProvider, ModelInfo, StreamChatParams } from '../types/provider';
import { ApiProfile } from '../types/apiProfile';

export const MOCK_PROFILE_ID = 'builtin-mock-provider';

export const MOCK_API_PROFILE: ApiProfile = {
  id: MOCK_PROFILE_ID,
  name: 'Demo Simulator (検証用モック)',
  baseUrl: 'https://mock.grill-web.local/v1',
  apiKey: 'mock-key-demo-only',
  headers: [],
  rememberKey: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export class MockLlmProvider implements ILlmProvider {
  async testConnection(): Promise<{ success: boolean; latencyMs: number }> {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { success: true, latencyMs: 85 };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'mock-grill-fast', name: 'Grill Simulator (Fast 2-Round)' },
      { id: 'mock-grill-deep', name: 'Grill Simulator (Thorough 3-Round)' },
    ];
  }

  async chat(params: StreamChatParams): Promise<string> {
    const { messages, onChunk, signal } = params;

    // Determine current round from message history
    const userAnswersCount = messages.filter(
      (m) => m.role === 'user' && m.content.includes('【Round')
    ).length;

    const currentRoundNumber = userAnswersCount + 1;
    const isLastRound = currentRoundNumber >= 2;

    let responseObj: any;

    if (!isLastRound) {
      // Round 1
      responseObj = {
        round: 1,
        finished: false,
        completion: {
          progressPercentage: 45,
          reasoning: '対象ユーザーと主機能のスコープ定義を検証中',
        },
        decisions: [
          'MVPではクライアント完結のWebアプリケーションとして提供する',
          '初期フェーズでは複雑なバックエンドを持たず、ローカルファーストで動作させる',
        ],
        assumptions: [
          'ユーザーはモダンなブラウザ（Chrome, Firefox, Safari）を利用する',
        ],
        conflicts: [
          '機能の豊富さと初期リリースのスピードのトレードオフ',
        ],
        openIssues: [
          'データ永続化の方法（IndexedDBかLocalStorageか）',
          'APIキーの保護ポリシーとユーザー利便性のバランス',
        ],
        questions: [
          {
            id: 'q1',
            category: 'スコープ',
            question: '初期リリースで想定する主対象ユーザーは誰ですか？',
            options: [
              '個人開発者・エンジニア（APIキー所有者）',
              '非エンジニアのプロダクトマネージャー・プランナー',
              '社内小規模チームでの共同検討',
            ],
            recommendedAnswer: '個人開発者・エンジニア（APIキー所有者）',
            explanation: 'まずは技術リテラシーの高い層に最短で刺さる検証を行うことで、フィードバックループを最速化できます。',
          },
          {
            id: 'q2',
            category: 'データ永続化',
            question: 'セッションや入力データの保存場所はどこにしますか？',
            options: [
              'ブラウザのIndexedDB（ローカル完結・プライバシー安全）',
              'クラウド同期（サーバー側データベース）',
              '一時メモリのみ（保存しない）',
            ],
            recommendedAnswer: 'ブラウザのIndexedDB（ローカル完結・プライバシー安全）',
            explanation: '外部への漏洩リスクを排除しつつ、リロード後もセッションが途切れない信頼性を担保できます。',
          },
        ],
        finalHandoff: '',
      };
    } else {
      // Round 2 (Finish & generate Handoff)
      responseObj = {
        round: 2,
        finished: true,
        completion: {
          progressPercentage: 100,
          reasoning: '主要な要件・スコープ・データ構造の合意が完了しました',
        },
        decisions: [
          'MVPではクライアント完結のWebアプリケーションとして提供する',
          'ブラウザのIndexedDBを用いてローカル完結でセッションを永続化する',
          '初期対象は個人開発者とし、APIキーはブラウザ内保持をデフォルトOFFにする',
          '下流AIエージェントへの引き継ぎ用に構造化されたMarkdownプロンプトを出力する',
        ],
        assumptions: [
          'ブラウザがCORS通信を許可するOpenAI互換エンドポイントを対象とする',
          'IndexedDBのQuota内で数千セッションは十分に保持可能であること',
        ],
        conflicts: [],
        openIssues: [
          '将来的な複数モデル並行実行（v0.2以降で検討）',
        ],
        questions: [],
        finalHandoff: `# Grill-Web 最適化実装プロンプト (Agent Handoff)

## 1. ゴール・目的
OpenAI互換APIを活用し、曖昧な要求・構想を対話型の質問を通じて明確化し、別のAIエージェントへそのまま渡せる実行用プロンプトを高速・安全に出力する。

## 2. 決定事項 (Decisions)
- クライアント完結SPA（Vue 3/React + TypeScript + Dexie/IndexedDB + Tailwind）
- OpenAI互換API（/models, /chat/completions）のストリーミングSSE対応
- 状態機械による厳格な進行管理とZodスキーマ検証
- APIキーのブラウザ保存はデフォルトOFF、任意保存時の警告明示
- 1ラウンドあたり2〜3問の選択肢・推奨回答付きヒアリング

## 3. 要件定義 (Requirements)
- **API Profile管理**: Base URL検証、ヘッダー設定、接続テスト、モデル一覧取得とキャッシュ
- **Grill対話UI**: 質問一覧、推奨回答ボタン、一括推奨承認、自由記述、リアルタイム進捗バー
- **状況可視化**: 確定事項、仮定、矛盾、未解決事項のリアルタイム一覧
- **Handoff生成**: ワンクリックコピーおよびMarkdownファイルのダウンロード

## 4. 制約条件 (Constraints & Non-goals)
- サーバー側プロキシは導入せず直接通信を行う（CORS前提）
- バックアップ暗号化やクラウド同期はMVPスコープ外とする

## 5. 推奨実装計画 (Implementation Plan)
1. Phase 0: 型定義・Dexieスキーマ・Zodレスポンスパーサー
2. Phase 1: API Profile CRUD・接続テスト・モデル取得
3. Phase 2: Grill状態マシン・ストリーミング・Handoff生成
4. Phase 3: セッション一覧・再開・Markdownダウンロード
5. Phase 4: セキュリティ監査・エラーハンドリング・レスポンシブ

## 6. 受入条件 (DoD)
- [x] テーマ入力から2ラウンド以上のヒアリングを経てHandoffが正常生成されること
- [x] リロード後もセッションが復元できること
- [x] 不正なAI応答や通信エラーから安全に復帰できること`,
      };
    }

    const fullJson = JSON.stringify(responseObj, null, 2);

    // Simulate realistic streaming in chunks
    const chunkSize = 28;
    let accumulated = '';
    for (let i = 0; i < fullJson.length; i += chunkSize) {
      if (signal?.aborted) {
        throw new DOMException('Aborted by user', 'AbortError');
      }
      const chunk = fullJson.slice(i, i + chunkSize);
      accumulated += chunk;
      if (onChunk) {
        onChunk(chunk, accumulated);
      }
      // slight delay to emulate network streaming
      await new Promise((resolve) => setTimeout(resolve, 35));
    }

    return accumulated;
  }
}

export const mockLlmProvider = new MockLlmProvider();
