import React from 'react';
import { RoutePath } from '../app/router';
import { Flame, Layers, Key, FileCode, Play } from 'lucide-react';

interface HeaderProps {
  currentRoute: RoutePath;
  onNavigate: (route: RoutePath) => void;
  activeSessionCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentRoute,
  onNavigate,
}) => {
  const isStart = currentRoute.route === 'start';
  const isSessions = currentRoute.route === 'sessions';
  const isApis = currentRoute.route === 'settings-apis';
  const isPrompts = currentRoute.route === 'settings-prompts';

  return (
    <header id="app-header" className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onNavigate({ route: 'start' })}
          aria-label="Grill-Web 開始画面へ移動"
          className="flex items-center space-x-3 cursor-pointer text-left rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
        >
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Flame className="w-6 h-6 text-white" />
          </span>
          <span className="block">
            <span className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">Grill-Web</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                v0.1.0 MVP
              </span>
            </span>
            <span className="block text-xs text-slate-400 hidden sm:block">
              曖昧な構想を掘り下げ、AIエージェント実行用プロンプトへ最適化
            </span>
          </span>
        </button>

        <nav className="flex items-center space-x-1 sm:space-x-2" aria-label="Main Navigation">
          <button
            id="nav-start-btn"
            onClick={() => onNavigate({ route: 'start' })}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isStart
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>開始</span>
          </button>

          <button
            id="nav-sessions-btn"
            onClick={() => onNavigate({ route: 'sessions' })}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isSessions
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>セッション</span>
          </button>

          <button
            id="nav-apis-btn"
            onClick={() => onNavigate({ route: 'settings-apis' })}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isApis
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>API設定</span>
          </button>

          <button
            id="nav-prompts-btn"
            onClick={() => onNavigate({ route: 'settings-prompts' })}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isPrompts
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>プロンプト</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
