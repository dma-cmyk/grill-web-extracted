import React, { useState, useEffect } from 'react';
import { PromptProfile } from '../../types/promptProfile';
import { promptProfileRepo } from '../../storage/promptProfileRepo';
import { FileCode, Plus, Copy, Trash2, Edit3, ShieldCheck } from 'lucide-react';
import { Dialog } from '../../components/Dialog';

export const PromptProfilesView: React.FC = () => {
  const [prompts, setPrompts] = useState<PromptProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<Partial<PromptProfile> | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<PromptProfile | null>(null);

  const loadPrompts = async () => {
    setLoading(true);
    const list = await promptProfileRepo.getAll();
    setPrompts(list);
    setLoading(false);
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleClone = async (id: string) => {
    await promptProfileRepo.clone(id);
    loadPrompts();
  };

  const handleDelete = async (id: string) => {
    if (confirm('このカスタムプロンプトを削除しますか？')) {
      await promptProfileRepo.delete(id);
      loadPrompts();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrompt?.name || !editingPrompt?.systemPrompt) return;

    const toSave: PromptProfile = {
      id: editingPrompt.id || 'custom-' + Math.random().toString(36).substring(2, 9),
      name: editingPrompt.name.trim(),
      description: editingPrompt.description || '',
      systemPrompt: editingPrompt.systemPrompt.trim(),
      builtIn: !!editingPrompt.builtIn,
      createdAt: editingPrompt.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    await promptProfileRepo.save(toSave);
    setEditingPrompt(null);
    loadPrompts();
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileCode className="w-6 h-6 text-orange-500" />
            Prompt Profile 設定
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Grillの進行方針、深掘り観点、出力フォーマットを定義するシステムプロンプトを管理します。
          </p>
        </div>
        <button
          onClick={() =>
            setEditingPrompt({
              name: '',
              description: '',
              systemPrompt: '',
              builtIn: false,
            })
          }
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          新規カスタムPrompt
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">読み込み中...</div>
      ) : (
        <div className="grid gap-4">
          {prompts.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-start justify-between gap-4 hover:border-slate-300 transition-colors"
            >
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900 text-base">{p.name}</h3>
                  {p.builtIn ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-medium flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      組み込み
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      カスタム
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{p.description}</p>
                <div className="pt-1">
                  <button
                    onClick={() => setPreviewPrompt(p)}
                    className="text-xs text-orange-600 hover:underline font-medium cursor-pointer"
                  >
                    システムプロンプトを表示
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleClone(p.id)}
                  title="複製して編集"
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>複製</span>
                </button>

                {!p.builtIn && (
                  <>
                    <button
                      onClick={() => setEditingPrompt(p)}
                      className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>編集</span>
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>削除</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview prompt modal */}
      {previewPrompt && (
        <Dialog
          onClose={() => setPreviewPrompt(null)}
          titleId="prompt-preview-title"
          descriptionId="prompt-preview-desc"
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto"
          panelClassName="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8"
        >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 id="prompt-preview-title" className="text-base font-bold text-slate-900">{previewPrompt.name}</h3>
                <p id="prompt-preview-desc" className="text-xs text-slate-500">{previewPrompt.description}</p>
              </div>
              <button
                onClick={() => setPreviewPrompt(null)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕ 閉じる
              </button>
            </div>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
              {previewPrompt.systemPrompt}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setPreviewPrompt(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                閉じる
              </button>
            </div>
        </Dialog>
      )}

      {/* Edit custom prompt modal */}
      {editingPrompt && (
        <Dialog
          onClose={() => setEditingPrompt(null)}
          titleId="prompt-edit-title"
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto"
          panelClassName="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8"
        >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="prompt-edit-title" className="text-lg font-bold text-slate-900">
                {editingPrompt.id ? 'カスタム Prompt の編集' : '新規カスタム Prompt の作成'}
              </h2>
              <button
                onClick={() => setEditingPrompt(null)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕ 閉じる
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Prompt 名 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: セキュリティ強化型 Grill"
                  value={editingPrompt.name || ''}
                  onChange={(e) => setEditingPrompt({ ...editingPrompt, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  概要・説明
                </label>
                <input
                  type="text"
                  placeholder="このプロンプトの目的や特徴"
                  value={editingPrompt.description || ''}
                  onChange={(e) => setEditingPrompt({ ...editingPrompt, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  システムプロンプト (指示文) *
                </label>
                <textarea
                  rows={10}
                  required
                  value={editingPrompt.systemPrompt || ''}
                  onChange={(e) => setEditingPrompt({ ...editingPrompt, systemPrompt: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono leading-relaxed focus:ring-2 focus:ring-orange-500/30"
                  placeholder="あなたは要件定義エージェントです..."
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  ※ 出力形式として指定のJSON構造 (round, finished, completion, decisions, questions など) を崩さないようにしてください。
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPrompt(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  保存する
                </button>
              </div>
            </form>
        </Dialog>
      )}
    </div>
  );
};
