import React, { useState, useEffect } from 'react';
import { RoutePath } from '../../app/router';
import { SessionRecord } from '../../types/session';
import { sessionRepo } from '../../storage/sessionRepo';
import {
  Layers,
  Search,
  Trash2,
  Play,
  FileText,
  Clock,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

interface SessionsViewProps {
  onNavigate: (route: RoutePath) => void;
}

export const SessionsView: React.FC<SessionsViewProps> = ({ onNavigate }) => {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const loadSessions = async (query = '') => {
    setLoading(true);
    const list = query ? await sessionRepo.search(query) : await sessionRepo.getAll();
    setSessions(list);
    setLoading(false);
  };

  useEffect(() => {
    loadSessions(searchQuery);
  }, [searchQuery]);

  const handleDelete = async (id: string) => {
    await sessionRepo.delete(id);
    setDeleteTargetId(null);
    loadSessions(searchQuery);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-orange-500" />
            セッション一覧
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            過去に実施したGrillヒアリングの履歴、確定事項、成果物を確認・再開できます。
          </p>
        </div>

        <button
          onClick={() => onNavigate({ route: 'start' })}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Play className="w-4 h-4" />
          新規セッション開始
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
        <input
          type="text"
          placeholder="テーマ、モデル名、確定事項のキーワードで検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
        />
      </div>

      {/* Sessions List */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">読み込み中...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
          <Layers className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-semibold text-slate-800">
            {searchQuery ? '検索条件に一致するセッションがありません' : 'セッションがまだありません'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? '別のキーワードでお試しいただくか、検索条件をクリアしてください。'
              : '「新規セッション開始」から新しいテーマのGrillを開始してみましょう。'}
          </p>
          {!searchQuery && (
            <div className="pt-2">
              <button
                onClick={() => onNavigate({ route: 'start' })}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-xl cursor-pointer"
              >
                新しいGrillを開始
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {sessions.map((s) => {
            const isCompleted = s.status === 'completed';
            const dateStr = new Date(s.updatedAt).toLocaleString('ja-JP', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={s.id}
                id={`session-card-${s.id}`}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900 text-base">{s.title}</h3>
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${
                        isCompleted
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1'
                          : s.status === 'recoverable_error'
                          ? 'bg-red-50 text-red-700 border border-red-200 flex items-center gap-1'
                          : 'bg-orange-50 text-orange-700 border border-orange-200'
                      }`}
                    >
                      {isCompleted ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          完了
                        </>
                      ) : s.status === 'recoverable_error' ? (
                        <>
                          <AlertTriangle className="w-3 h-3" />
                          エラー発生
                        </>
                      ) : (
                        `Round ${s.currentRound} 進行中`
                      )}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {s.theme}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {dateStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5 text-slate-400" />
                      {s.selectionSnapshot.modelName}
                    </span>
                    <span>確定事項: <strong className="text-slate-700">{s.decisions.length}件</strong></span>
                    <span>進捗: <strong className="text-slate-700">{s.progress}%</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                  {isCompleted ? (
                    <button
                      onClick={() => onNavigate({ route: 'handoff', sessionId: s.id })}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Handoff</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onNavigate({ route: 'grill', sessionId: s.id })}
                      className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Play className="w-4 h-4" />
                      <span>再開</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => onNavigate({ route: 'grill', sessionId: s.id })}
                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 text-xs cursor-pointer"
                    title="詳細・対話履歴"
                  >
                    履歴
                  </button>

                  <button
                    onClick={() => setDeleteTargetId(s.id)}
                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl border border-red-200 text-xs cursor-pointer"
                    title="削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">セッションの削除確認</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              このGrillセッションとそのヒアリング履歴・確定事項を削除しますか？<br />
              <span className="text-xs text-red-600">※ この操作は取り消せません。</span>
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDelete(deleteTargetId)}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg cursor-pointer"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
