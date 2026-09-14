import React from 'react';
import { RoutePath } from '../app/router';
import { Flame, Layers, Key, FileCode, Play, Github } from 'lucide-react';

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => onNavigate({ route: 'start' })}
          aria-label="Grill-Web 開始画面へ移動"
          className="flex min-w-0 items-center space-x-3 cursor-pointer text-left rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
        >
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Flame className="w-6 h-6 text-white" />
          </span>
          <span className="block min-w-0">
            <span className="flex min-w-0 items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white whitespace-nowrap">Grill-Web</span>
              <span className="hidden sm:inline-block text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                v0.1.0 MVP
              </span>
            </span>
            <span className="block text-xs text-slate-400 hidden sm:block">
              曖昧な構想を掘り下げ、AIエージェント実行用プロンプトへ最適化
            </span>
          </span>
        </button>

        <nav className="flex flex-wrap items-center justify-center gap-1 sm:gap-2" aria-label="Main Navigation">
          <button
            id="nav-start-btn"
            onClick={() => onNavigate({ route: 'start' })}
            className={`flex items-center space-x-1.5 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isStart
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Play className="w-4 h-4" />
            <span className="sr-only sm:not-sr-only">開始</span>
          </button>

          <button
            id="nav-sessions-btn"
            onClick={() => onNavigate({ route: 'sessions' })}
            className={`flex items-center space-x-1.5 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isSessions
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="sr-only sm:not-sr-only">セッション</span>
          </button>

          <button
            id="nav-apis-btn"
            onClick={() => onNavigate({ route: 'settings-apis' })}
            className={`flex items-center space-x-1.5 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isApis
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Key className="w-4 h-4" />
            <span className="sr-only sm:not-sr-only">API設定</span>
          </button>

          <button
            id="nav-prompts-btn"
            onClick={() => onNavigate({ route: 'settings-prompts' })}
            className={`flex items-center space-x-1.5 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isPrompts
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span className="sr-only sm:not-sr-only">プロンプト</span>
          </button>

          <a
            href="https://github.com/dma-cmyk/grill-web-extracted"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub リポジトリを新しいタブで開く"
            className="flex items-center space-x-1.5 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <Github className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
};
