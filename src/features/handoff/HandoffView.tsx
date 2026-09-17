import React, { useState, useEffect, useRef } from 'react';
import { RoutePath } from '../../app/router';
import { SessionRecord } from '../../types/session';
import { sessionRepo } from '../../storage/sessionRepo';
import { generateAgentHandoffPrompt } from '../../core/handoffGenerator';
import {
  FileText,
  Copy,
  CheckCircle2,
  Download,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
  Layers,
  Code,
  Eye,
} from 'lucide-react';

interface HandoffViewProps {
  sessionId: string;
  onNavigate: (route: RoutePath) => void;
}
export const HandoffView: React.FC<HandoffViewProps> = ({ sessionId, onNavigate }) => {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [handoffPrompt, setHandoffPrompt] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'raw'>('preview');
  const [copyFailed, setCopyFailed] = useState(false);
  const [copyFailMessage, setCopyFailMessage] = useState<string>('');
  const [fallbackCounter, setFallbackCounter] = useState(0);

  const handoffFallbackRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    async function load() {
      setNotFound(false);
      setLoading(true);
      const s = await sessionRepo.getById(sessionId);
      if (!s) {
        setLoading(false);
        setNotFound(true);
        return;
      }
      setSession(s);

      // Ensure handoff prompt is generated
      const prompt = generateAgentHandoffPrompt(s);
      setHandoffPrompt(prompt);

      // Persist if not saved yet
      if (!s.finalHandoff) {
        s.finalHandoff = prompt;
        await sessionRepo.save(s);
      }

      setLoading(false);
    }
    load();
  }, [sessionId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(handoffPrompt);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyFailed(true);
      setCopied(false);
      setCopyFailMessage('クリップボードへのコピーに失敗しました。以下に代替手段が表示されます。');
      setFallbackCounter((c) => c + 1);
    }
  };
  useEffect(() => {
    if (copyFailed) handoffFallbackRef.current?.focus();
  }, [copyFailed, fallbackCounter]);

  const handleDownload = () => {
    const blob = new Blob([handoffPrompt], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (session?.title || 'grill-handoff')
      .replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF_-]/g, '_')
      .slice(0, 30);
    a.download = `${safeTitle}-handoff.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (notFound) {
    return (
      <div role="alert" className="text-center py-20 text-slate-600 space-y-4">
        <p>セッションが見つかりませんでした。</p>
        <button onClick={() => onNavigate({ route: 'sessions' })} className="px-4 py-2 bg-orange-600 text-white rounded-lg cursor-pointer">
          セッション一覧へ
        </button>
      </div>
    );
  }

  if (loading || !session) {
    return <div className="text-center py-20 text-slate-400">成果物を読み込み中...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* Top navigation & action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5 min-w-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => onNavigate({ route: 'grill', sessionId: session.id })}
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Grill対話へ戻る
            </button>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2 break-words min-w-0">
            <FileText className="w-6 h-6 text-emerald-600" />
            Agent Handoff Prompt (実行用プロンプト)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Claude Code, Cursor, Windsurf, Devin などのAIコーディングエージェントにそのまま入力可能な構造化プロンプトです。
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <button
            id="copy-handoff-btn"
            onClick={handleCopy}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer transition-transform active:scale-98"
          >
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'クリップボードにコピー済！' : 'プロンプトをコピー'}</span>
          </button>

          <button
            id="download-md-btn"
            onClick={handleDownload}
            className="px-3.5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Markdown保存</span>
          </button>
        </div>
      </div>
      {copyFailed && (
        <div id="handoff-copy-error" role="alert" aria-live="polite" className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 space-y-2">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{copyFailMessage}</div>
          <label htmlFor="handoff-raw-textarea" className="block text-xs font-semibold">Rawテキスト（手動コピー）</label>
          <textarea id="handoff-raw-textarea" ref={handoffFallbackRef} value={handoffPrompt} readOnly aria-describedby="handoff-copy-error" rows={6} className="w-full border border-red-300 rounded-lg p-2 text-xs font-mono" />
        </div>
      )}

      {/* Metadata summary bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 min-w-0">
        <div className="flex items-center gap-4 flex-wrap">
          <span>テーマ: <strong className="text-slate-900">{session.theme.slice(0, 40)}{session.theme.length > 40 ? '...' : ''}</strong></span>
          <span>総ラウンド: <strong className="text-slate-900">{session.rounds.length}</strong></span>
          <span>確定事項: <strong className="text-emerald-700">{session.decisions.length}件</strong></span>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'preview'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>プレビュー</span>
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'raw'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Rawテキスト</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'preview' ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="prose prose-slate max-w-none text-xs sm:text-sm leading-relaxed space-y-4">
            <div className="whitespace-pre-wrap font-sans text-slate-800 selection:bg-orange-100">
              {handoffPrompt}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-xl border border-slate-800">
          <textarea
            readOnly
            value={handoffPrompt}
            rows={24}
            className="w-full bg-transparent font-mono text-xs text-slate-200 focus:outline-hidden resize-none leading-relaxed"
          />
        </div>
      )}

      {/* Footer next action */}
      <div className="pt-4 flex justify-between items-center text-xs text-slate-500 flex-wrap gap-3">
        <button
          onClick={() => onNavigate({ route: 'sessions' })}
          className="hover:text-slate-900 flex items-center gap-1 cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5" />
          セッション一覧へ
        </button>

        <button
          onClick={() => onNavigate({ route: 'start' })}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl cursor-pointer"
        >
          新しいGrillを開始する
        </button>
      </div>
    </div>
  );
};
