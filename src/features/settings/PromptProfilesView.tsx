import React, { useState, useEffect, useId } from 'react';
import { PromptProfile } from '../../types/promptProfile';
import { promptProfileRepo } from '../../storage/promptProfileRepo';
import { FileCode, Plus, Copy, Trash2, Edit3, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Dialog } from '../../components/Dialog';

export const PromptProfilesView: React.FC = () => {
  const baseId = useId();
  const [prompts, setPrompts] = useState<PromptProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<Partial<PromptProfile> | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<PromptProfile | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; success: boolean; message: string } | null>(null);

  const loadPrompts = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await promptProfileRepo.getAll();
      setPrompts(list);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleClone = async (id: string) => {
    setCloningId(id);
    try {
      await promptProfileRepo.clone(id);
      await loadPrompts();
      setToast({ id: `toast-${Date.now()}`, success: true, message: 'プロンプトを複製しました' });
    } catch (err: unknown) {
      setToast({
        id: `toast-${Date.now()}`,
        success: false,
        message: `複製に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setCloningId(null);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    setDeletingId(id);
    try {
      await promptProfileRepo.delete(id);
      await loadPrompts();
      setToast({ id: `toast-${Date.now()}`, success: true, message: 'プロンプトを削除しました' });
    } catch (err: unknown) {
      setToast({
        id: `toast-${Date.now()}`,
        success: false,
        message: `削除に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setDeletingId(null);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const nameVal = (editingPrompt?.name || '').trim();
    const promptVal = (editingPrompt?.systemPrompt || '').trim();

    let hasError = false;
    if (!nameVal) {
      setNameError('Prompt名は必須です');
      hasError = true;
    } else {
      setNameError(null);
    }

    if (!promptVal) {
      setPromptError('システムプロンプトは必須です');
      hasError = true;
    } else {
      setPromptError(null);
    }

    if (hasError) return;

    setSaving(true);
    try {
      const toSave: PromptProfile = {
        id: editingPrompt!.id || 'custom-' + Math.random().toString(36).substring(2, 9),
        name: nameVal,
        description: editingPrompt!.description || '',
        systemPrompt: promptVal,
        builtIn: !!editingPrompt!.builtIn,
        createdAt: editingPrompt!.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await promptProfileRepo.save(toSave);
      setEditingPrompt(null);
      await loadPrompts();
    } catch (err: unknown) {
      setToast({
        id: `toast-${Date.now()}`,
        success: false,
        message: `保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
      setTimeout(() => setToast(null), 2500);
    } finally {
      setSaving(false);
    }
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
          id={`${baseId}-btn-add-prompt`}
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

      {/* Toast */}
      {toast && (
        <div
          role={toast.success ? 'status' : 'alert'}
          aria-live="polite"
          className={`text-sm px-4 py-3 rounded-xl border flex items-center gap-2 shadow-md ${
            toast.success
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {toast.success ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {loading ? (
        <div role="status" aria-live="polite" className="text-center py-12 text-slate-400">読み込み中...</div>
      ) : loadError ? (
        <div role="alert" className="text-center py-12 text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
          <p className="font-medium">プロンプト読み込みに失敗しました</p>
          <p className="text-xs text-red-500 mt-1">{loadError}</p>
          <button
            onClick={loadPrompts}
            className="mt-3 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-500 cursor-pointer"
          >
            再試行
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {prompts.map((p) => (
            <div
              key={p.id}
              id={`prompt-card-${p.id}`}
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
                  disabled={cloningId === p.id}
                  aria-label={`${p.name}を複製`}
                  title="複製して編集"
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{cloningId === p.id ? '複製中...' : '複製'}</span>
                </button>

                {!p.builtIn && (
                  <>
                    <button
                      onClick={() => setEditingPrompt(p)}
                      aria-label={`${p.name}を編集`}
                      className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>編集</span>
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      aria-label={`${p.name}を削除`}
                      className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{deletingId === p.id ? '削除中...' : '削除'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTargetId && (
        <Dialog
          onClose={() => setDeleteTargetId(null)}
          titleId="prompt-delete-title"
          descriptionId="prompt-delete-desc"
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          panelClassName="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
        >
          <h3 id="prompt-delete-title" className="text-lg font-bold text-slate-900">プロンプトの削除確認</h3>
          <p id="prompt-delete-desc" className="text-sm text-slate-600 leading-relaxed">
            このカスタムプロンプトを削除しますか？<br />
            <span className="text-xs text-slate-500">※ このプロンプトを基に作成された過去のセッションデータは削除されません。</span>
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setDeleteTargetId(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              キャンセル
            </button>
            <button
              onClick={confirmDelete}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg cursor-pointer"
            >
              削除する
            </button>
          </div>
        </Dialog>
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

          <form onSubmit={handleSave} className="space-y-4" noValidate>
            <div>
              <label htmlFor={`${baseId}-prompt-name`} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Prompt 名 *
              </label>
              <input
                id={`${baseId}-prompt-name`}
                type="text"
                required
                aria-required="true"
                aria-invalid={!!nameError}
                aria-describedby={nameError ? `${baseId}-name-error` : undefined}
                placeholder="例: セキュリティ強化型 Grill"
                value={editingPrompt.name || ''}
                onChange={(e) => {
                  setEditingPrompt({ ...editingPrompt, name: e.target.value });
                  if (nameError) setNameError(null);
                }}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${
                  nameError ? 'border-red-500 focus:ring-red-500/20' : 'border-slate-300 focus:ring-orange-500/30'
                } focus:outline-hidden focus:ring-2 focus:border-orange-500`}
              />
              {nameError && (
                <p id={`${baseId}-name-error`} role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {nameError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor={`${baseId}-prompt-desc`} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                概要・説明
              </label>
              <input
                id={`${baseId}-prompt-desc`}
                type="text"
                placeholder="このプロンプトの目的や特徴"
                value={editingPrompt.description || ''}
                onChange={(e) => setEditingPrompt({ ...editingPrompt, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              />
            </div>

            <div>
              <label htmlFor={`${baseId}-prompt-content`} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                システムプロンプト (指示文) *
              </label>
              <textarea
                id={`${baseId}-prompt-content`}
                rows={10}
                required
                aria-required="true"
                aria-invalid={!!promptError}
                aria-describedby={promptError ? `${baseId}-prompt-error` : `${baseId}-prompt-hint`}
                value={editingPrompt.systemPrompt || ''}
                onChange={(e) => {
                  setEditingPrompt({ ...editingPrompt, systemPrompt: e.target.value });
                  if (promptError) setPromptError(null);
                }}
                className={`w-full px-3 py-2 border rounded-lg text-xs font-mono leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-orange-500/30 ${
                  promptError ? 'border-red-500 focus:ring-red-500/20' : 'border-slate-300 focus:border-orange-500'
                }`}
                placeholder="あなたは要件定義エージェントです..."
              />
              {promptError ? (
                <p id={`${baseId}-prompt-error`} role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {promptError}
                </p>
              ) : (
                <p id={`${baseId}-prompt-hint`} className="text-[11px] text-slate-500 mt-1">
                  ※ 出力形式として指定のJSON構造 (round, finished, completion, decisions, questions など) を崩さないでください。
                </p>
              )}
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
                disabled={saving}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm cursor-pointer"
              >
                {saving ? '保存中...' : '保存する'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
};