import React, { useEffect, useState } from 'react';
import { useRouter } from './app/router';
import { Header } from './components/Header';
import { StartView } from './features/start/StartView';
import { GrillView } from './features/grill/GrillView';
import { SessionsView } from './features/sessions/SessionsView';
import { HandoffView } from './features/handoff/HandoffView';
import { ApiProfilesView } from './features/settings/ApiProfilesView';
import { PromptProfilesView } from './features/settings/PromptProfilesView';
import { ensureDatabaseInitialized } from './storage/db';

export default function App() {
  const { currentRoute, navigate } = useRouter();
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    ensureDatabaseInitialized().then(() => {
      setDbReady(true);
    });
  }, []);

  if (!dbReady) {
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
