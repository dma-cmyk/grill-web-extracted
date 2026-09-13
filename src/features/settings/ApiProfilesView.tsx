import React, { useState, useEffect } from 'react';
import { ApiProfile, CustomHeader, ModelCacheItem } from '../../types/apiProfile';
import { apiProfileRepo } from '../../storage/apiProfileRepo';
import { getProviderForProfile } from '../../providers';
import { maskPlainSecrets, maskSecret, validateBaseUrl } from '../../security/masking';
import { inMemoryKeyStore } from '../../security/inMemoryKeyStore';
import { MOCK_API_PROFILE } from '../../providers/mockProvider';
import { Dialog } from '../../components/Dialog';
import { Key, Plus, Trash2, Edit2, CheckCircle2, AlertTriangle, RefreshCw, Server, ShieldAlert, Cpu } from 'lucide-react';

export const ApiProfilesView: React.FC = () => {
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<Partial<ApiProfile> | null>(null);
  const [tempApiKey, setTempApiKey] = useState<string>('');
  const [testResult, setTestResult] = useState<{ success?: boolean; latencyMs?: number; message?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [cachedModels, setCachedModels] = useState<Record<string, ModelCacheItem[]>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const refreshUrlValidation = (baseUrl: string | undefined, apiKey: string, headers: CustomHeader[]) => {
    if (!baseUrl) {
      setUrlError(null);
      return;
    }
    const hasCredentials = !!apiKey.trim() || headers.some((header) => !!header.value.trim());
    const check = validateBaseUrl(baseUrl, hasCredentials);
    setUrlError(check.valid ? null : check.error || '無効なURL形式です');
  };

  const loadProfiles = async () => {
    setLoading(true);
    let list = await apiProfileRepo.getAll();
    if (list.length === 0) {
      // Seed default mock simulator for instant verification
      await apiProfileRepo.save(MOCK_API_PROFILE);
      await apiProfileRepo.saveCachedModels(MOCK_API_PROFILE.id, [
        { id: 'mock-grill-fast', name: 'Grill Simulator (Fast 2-Round)' },
        { id: 'mock-grill-deep', name: 'Grill Simulator (Thorough 3-Round)' },
      ]);
      list = await apiProfileRepo.getAll();
    }
    setProfiles(list);

    // Load cached models for each
    const cacheMap: Record<string, ModelCacheItem[]> = {};
    for (const p of list) {
      cacheMap[p.id] = await apiProfileRepo.getCachedModels(p.id);
    }
    setCachedModels(cacheMap);
    setLoading(false);
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const openCreateModal = () => {
    setEditingProfile({
      name: '',
      baseUrl: 'https://api.openai.com/v1',
      headers: [],
      rememberKey: false,
    });
    setTempApiKey('');
    setTestResult(null);
    setUrlError(null);
  };

  const openEditModal = (p: ApiProfile) => {
    const memoryHeaders = inMemoryKeyStore.getHeaders(p.id);
    setEditingProfile({ ...p, headers: memoryHeaders || p.headers });
    // Retrieve key from profile (if remembered) or memory store
    const key = p.apiKey || inMemoryKeyStore.get(p.id) || '';
    setTempApiKey(key);
    setTestResult(null);
    setUrlError(null);
  };

  const handleBaseUrlChange = (val: string) => {
    if (editingProfile) {
      setEditingProfile({ ...editingProfile, baseUrl: val });
      refreshUrlValidation(val, tempApiKey, editingProfile.headers || []);
    }
  };

  const handleApiKeyChange = (value: string) => {
    setTempApiKey(value);
    if (editingProfile) refreshUrlValidation(editingProfile.baseUrl, value, editingProfile.headers || []);
  };
  const handleTestConnection = async () => {
    if (!editingProfile?.baseUrl) return;
    const hasCredentials = !!tempApiKey.trim() || (editingProfile.headers || []).some((header) => !!header.value.trim());
    const check = validateBaseUrl(editingProfile.baseUrl, hasCredentials);
    if (!check.valid) {
      setUrlError(check.error || '無効なURLです');
      return;
    }

    setTesting(true);
    setTestResult(null);

    const profileToTest: ApiProfile = {
      id: editingProfile.id || 'temp-test',
      name: editingProfile.name || 'Test',
      baseUrl: editingProfile.baseUrl,
      headers: editingProfile.headers || [],
      rememberKey: !!editingProfile.rememberKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const provider = getProviderForProfile(profileToTest);
    const res = await provider.testConnection(profileToTest, tempApiKey);

    setTesting(false);
    if (res.success) {
      setTestResult({
        success: true,
        latencyMs: res.latencyMs,
        message: `接続成功 (応答速度: ${res.latencyMs}ms)`,
      });
    } else {
      setTestResult({
        success: false,
        message: res.error?.message || '接続に失敗しました',
      });
    }
  };

  const handleFetchModels = async (profile: ApiProfile, keyToUse?: string) => {
    setFetchingModels(true);
    try {
      const provider = getProviderForProfile(profile);
      const effectiveKey = keyToUse || profile.apiKey || inMemoryKeyStore.get(profile.id);
      const models = await provider.listModels(profile, effectiveKey);
      const secrets = [effectiveKey, profile.apiKey, ...(profile.headers || []).map((header) => header.value), ...(inMemoryKeyStore.getHeaders(profile.id) || []).map((header) => header.value)];
      const maskedModels = models.map((model) => ({ id: maskPlainSecrets(model.id, secrets), name: maskPlainSecrets(model.name, secrets) }));
      await apiProfileRepo.saveCachedModels(profile.id, maskedModels);

      const updatedCache = await apiProfileRepo.getCachedModels(profile.id);
      setCachedModels((prev) => ({ ...prev, [profile.id]: updatedCache }));
    } catch (err: any) {
      alert(`モデル一覧の取得に失敗しました: ${err.message || err}`);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile?.name || !editingProfile?.baseUrl) return;

    const hasCredentials = !!tempApiKey.trim() || (editingProfile.headers || []).some((header) => !!header.value.trim());
    const check = validateBaseUrl(editingProfile.baseUrl, hasCredentials);
    if (!check.valid) {
      setUrlError(check.error || '無効なURLです');
      return;
    }
    const id = editingProfile.id || 'profile-' + Math.random().toString(36).substring(2, 9);
    const isRemember = !!editingProfile.rememberKey;
    const fullProfile: ApiProfile = {
      id,
      name: editingProfile.name.trim(),
      baseUrl: editingProfile.baseUrl.trim(),
      apiKey: tempApiKey.trim(),
      headers: editingProfile.headers || [],
      rememberKey: isRemember,
      createdAt: editingProfile.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // Keep all credentials in memory while persistence is disabled.
    if (!isRemember) {
      inMemoryKeyStore.set(id, tempApiKey.trim());
      inMemoryKeyStore.setHeaders(id, editingProfile.headers || []);
    } else {
      inMemoryKeyStore.set(id, '');
      inMemoryKeyStore.setHeaders(id, []);
    }

    await apiProfileRepo.save(fullProfile);

    // If no models cached yet, try fetching
    if (!cachedModels[id] || cachedModels[id].length === 0) {
      try {
        await handleFetchModels(fullProfile, tempApiKey.trim());
      } catch {
        // non-blocking
      }
    }

    setEditingProfile(null);
    setTempApiKey('');
    loadProfiles();
  };

  const handleDeleteProfile = async (id: string) => {
    await apiProfileRepo.delete(id);
    inMemoryKeyStore.delete(id);
    setDeleteConfirmId(null);
    loadProfiles();
  };

  const addHeaderRow = () => {
    if (!editingProfile) return;
    const headers = [...(editingProfile.headers || []), { key: '', value: '' }];
    setEditingProfile({ ...editingProfile, headers });
    refreshUrlValidation(editingProfile.baseUrl, tempApiKey, headers);
  };

  const updateHeaderRow = (index: number, key: string, value: string) => {
    if (!editingProfile) return;
    const headers = [...(editingProfile.headers || [])];
    headers[index] = { key, value };
    setEditingProfile({ ...editingProfile, headers });
    refreshUrlValidation(editingProfile.baseUrl, tempApiKey, headers);
  };

  const removeHeaderRow = (index: number) => {
    if (!editingProfile) return;
    const headers = [...(editingProfile.headers || [])];
    headers.splice(index, 1);
    setEditingProfile({ ...editingProfile, headers });
    refreshUrlValidation(editingProfile.baseUrl, tempApiKey, headers);
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Key className="w-6 h-6 text-orange-500" />
            API Profile 設定
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            OpenAI互換のAPIエンドポイント (OpenAI, OpenRouter, Groq, Ollama, LM Studio など) を管理します。
          </p>
        </div>
        <button
          id="btn-add-profile"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          新規Profile追加
        </button>
      </div>

      {/* Security notice banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs sm:text-sm text-amber-900 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-950">ローカルファーストとセキュリティ方針</p>
          <p className="text-amber-800">
            Grill-Webはクライアント完結のSPAです。入力されたAPIキーや対話内容はサーバーに送られず、ブラウザから指定のBase URLへ直接送信されます（接続先がCORSを許可している必要があります）。APIキーのブラウザ保存はデフォルトでOFFです。
          </p>
        </div>
      </div>

      {/* Profile list */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">読み込み中...</div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl shadow-xs">
          <Server className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">API Profileがまだ登録されていません</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            「新規Profile追加」ボタンからエンドポイントを登録するか、検証用モックを作成してください。
          </p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-500 cursor-pointer"
          >
            最初のProfileを作成
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {profiles.map((p) => {
            const models = cachedModels[p.id] || [];
            const isMock = p.id === MOCK_API_PROFILE.id;
            const hasMemoryKey = inMemoryKeyStore.has(p.id);

            return (
              <div
                key={p.id}
                id={`profile-card-${p.id}`}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 text-base">{p.name}</h3>
                    {isMock ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                        内蔵検証用モック
                      </span>
                    ) : (
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                          p.rememberKey
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : hasMemoryKey
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p.rememberKey ? 'ブラウザ保存ON' : hasMemoryKey ? 'セッション内保持中' : '未入力(要都度入力)'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-500 break-all">{p.baseUrl}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5 text-slate-400" />
                      モデル: {models.length > 0 ? `${models.length}個キャッシュ済` : '未取得'}
                    </span>
                    {p.apiKey && (
                      <span className="text-slate-400 font-mono">
                        キー: {maskSecret(p.apiKey)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleFetchModels(p)}
                    disabled={fetchingModels}
                    title="モデル一覧を再取得"
                    aria-label="モデル一覧を再取得"
                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${fetchingModels ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">モデル更新</span>
                  </button>

                  <button
                    onClick={() => openEditModal(p)}
                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>編集</span>
                  </button>

                  <button
                    onClick={() => setDeleteConfirmId(p.id)}
                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>削除</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <Dialog
          onClose={() => setDeleteConfirmId(null)}
          titleId="api-profile-delete-title"
          descriptionId="api-profile-delete-desc"
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          panelClassName="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
        >
            <h3 id="api-profile-delete-title" className="text-lg font-bold text-slate-900">Profileの削除確認</h3>
            <p id="api-profile-delete-desc" className="text-sm text-slate-600 leading-relaxed">
              このAPI Profileと関連するモデルキャッシュを削除しますか？<br />
              <span className="text-xs text-slate-500">※ このProfileを使用して作成された過去のセッションデータは削除されず保持されます。</span>
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDeleteProfile(deleteConfirmId)}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg cursor-pointer"
              >
                削除する
              </button>
            </div>
        </Dialog>
      )}

      {/* Edit / Create Profile Modal */}
      {editingProfile && (
        <Dialog
          onClose={() => setEditingProfile(null)}
          titleId="api-profile-edit-title"
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto"
          panelClassName="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8"
        >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="api-profile-edit-title" className="text-lg font-bold text-slate-900">
                {editingProfile.id ? 'API Profile の編集' : '新規 API Profile の登録'}
              </h2>
              <button
                onClick={() => setEditingProfile(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium cursor-pointer"
              >
                ✕ 閉じる
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Profile 名 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: OpenAI Official, OpenRouter, Local Ollama"
                  value={editingProfile.name || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Base URL *
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://api.openai.com/v1"
                  value={editingProfile.baseUrl || ''}
                  onChange={(e) => handleBaseUrlChange(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-hidden focus:ring-2 ${
                    urlError
                      ? 'border-red-500 focus:ring-red-500/20'
                      : 'border-slate-300 focus:ring-orange-500/30 focus:border-orange-500'
                  }`}
                />
                {urlError ? (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {urlError}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    http:// または https:// の形式。末尾の /chat/completions は不要です。
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="sk-..."
                  value={tempApiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  ローカルLLM (Ollamaなど) で不要な場合は空欄のままで構いません。
                </p>
              </div>

              {/* Remember key toggle with explicit warning */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editingProfile.rememberKey}
                    onChange={(e) => setEditingProfile({ ...editingProfile, rememberKey: e.target.checked })}
                    className="w-4 h-4 rounded text-orange-600 border-slate-300 focus:ring-orange-500"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    APIキーとカスタムヘッダーの値をこのブラウザ（IndexedDB）に保存する
                  </span>
                </label>
                {editingProfile.rememberKey && (
                  <div className="text-[11px] text-amber-800 bg-amber-100/70 border border-amber-300/60 rounded-lg p-2.5 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>警告:</strong> APIキーとカスタムヘッダーの値がIndexedDBに保存されます。OFFの場合はどちらも保存されず、このタブのメモリ内だけで保持されます。
                    </span>
                  </div>
                )}
              </div>

              {/* Custom Headers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    カスタムヘッダー (任意)
                  </span>
                  <button
                    type="button"
                    onClick={addHeaderRow}
                    className="text-xs text-orange-600 hover:text-orange-700 font-medium cursor-pointer"
                  >
                    + ヘッダー追加
                  </button>
                </div>
                {editingProfile.headers && editingProfile.headers.length > 0 && (
                  <div className="space-y-2">
                    {editingProfile.headers.map((h, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Header-Name"
                          value={h.key}
                          onChange={(e) => updateHeaderRow(idx, e.target.value, h.value)}
                          className="w-1/2 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                        <input
                          type="password"
                          placeholder="Header-Value"
                          value={h.value}
                          onChange={(e) => updateHeaderRow(idx, h.key, e.target.value)}
                          className="w-1/2 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => removeHeaderRow(idx)}
                          aria-label="このカスタムヘッダー行を削除"
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Connection Test Bar */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || !editingProfile.baseUrl}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                  {testing ? '接続テスト実行中...' : '接続テスト'}
                </button>

                {testResult && (
                  <div
                    className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 ${
                      testResult.success
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    )}
                    <span className="truncate max-w-xs">{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* Modal buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={!!urlError || !editingProfile.name}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm cursor-pointer"
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
