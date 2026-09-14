import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from './app/router';
import { Header } from './components/Header';
import { StartView } from './features/start/StartView';
import { GrillView } from './features/grill/GrillView';
import { SessionsView } from './features/sessions/SessionsView';
import { HandoffView } from './features/handoff/HandoffView';
import { ApiProfilesView } from './features/settings/ApiProfilesView';
import { PromptProfilesView } from './features/settings/PromptProfilesView';
import { ensureDatabaseInitialized, resetDatabase } from './storage/db';
import { sessionRepo } from './storage/sessionRepo';

export default function App() {
  const { currentRoute, navigate } = useRouter();
  const [dbReady, setDbReady] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  const initializeDatabase = useCallback(async () => {
    setDbReady(false);
    setInitializationError(null);
    try {
      await ensureDatabaseInitialized();
      await sessionRepo.normalizeTransientStatuses();
      setDbReady(true);
    } catch (error) {
      setInitializationError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void initializeDatabase();
  }, [initializeDatabase]);

  const handleResetDatabase = useCallback(async () => {
    setDbReady(false);
    setInitializationError(null);
    try {
      await resetDatabase();
      setInitializationError('データベースをリセットしました。再試行してください。');
    } catch (error) {
      setInitializationError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  if (!dbReady) {
    if (initializationError !== null) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
          <div className="max-w-md text-center space-y-4" role="alert">
            <h1 className="text-lg font-bold text-slate-900">データベースを初期化できませんでした</h1>
            <p className="text-sm text-red-700 break-words">{initializationError}</p>
            <p className="text-sm text-slate-600">
              ブラウザのストレージ設定、プライベートウィンドウの設定、空き容量を確認してください。
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => void initializeDatabase()}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                再試行
              </button>
              <button
                type="button"
                onClick={() => void handleResetDatabase()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                データベースをリセット
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-500">Grill-Web を起動中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-orange-100 selection:text-orange-900">
      <Header currentRoute={currentRoute} onNavigate={navigate} />

      <main className="flex-1 pb-16">
        {currentRoute.route === 'start' && <StartView onNavigate={navigate} />}
        {currentRoute.route === 'grill' && (
          <GrillView sessionId={currentRoute.sessionId} onNavigate={navigate} />
        )}
        {currentRoute.route === 'sessions' && <SessionsView onNavigate={navigate} />}
        {currentRoute.route === 'handoff' && (
          <HandoffView sessionId={currentRoute.sessionId} onNavigate={navigate} />
        )}
        {currentRoute.route === 'settings-apis' && <ApiProfilesView />}
        {currentRoute.route === 'settings-prompts' && <PromptProfilesView />}
      </main>
    </div>
  );
}
