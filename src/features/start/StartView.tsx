import React, { useState, useEffect, useRef } from 'react';
import { RoutePath } from '../../app/router';
import { ApiProfile, ModelCacheItem } from '../../types/apiProfile';
import { DEFAULT_PROMPT_PROFILE_ID } from '../../storage/defaultPromptProfiles';
import { PromptProfile } from '../../types/promptProfile';
import { SessionRecord, SelectionSnapshot } from '../../types/session';
import { AttachmentDraft } from '../../types/attachment';
import { apiProfileRepo } from '../../storage/apiProfileRepo';
import { promptProfileRepo } from '../../storage/promptProfileRepo';
import { sessionRepo } from '../../storage/sessionRepo';
import { attachmentRepo } from '../../storage/attachmentRepo';
import { inMemoryKeyStore } from '../../security/inMemoryKeyStore';
import { maskPlainSecrets } from '../../security/masking';
import { MOCK_API_PROFILE } from '../../providers/mockProvider';
import { ATTACHMENT_ACCEPT_ATTRIBUTE, describeAttachmentLimits, formatBytes, validateAttachmentFile } from '../../core/attachmentValidation';
import { Flame, Play, Sparkles, Sliders, ShieldCheck, Key, ArrowRight, HelpCircle, Search } from 'lucide-react';

interface StartViewProps {
  onNavigate: (route: RoutePath) => void;
}

const SAMPLE_THEMES = [
  '下流AIコーディングエージェント向けに、曖昧な要求を対話型ヒアリングで仕様化するWebアプリ',
  'ブラウザのIndexedDBを活用した、完全ローカル完結型のセキュアなMarkdownメモ管理ツール',
  'CORS対応のOpenAI互換APIへ直接ストリーミング接続できる、軽量テストクライアント',
];

const normalizeModelSearchValue = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export const StartView: React.FC<StartViewProps> = ({ onNavigate }) => {
  const [theme, setTheme] = useState('');
  const [depth, setDepth] = useState<SelectionSnapshot['depth']>('standard');
  const [apiProfiles, setApiProfiles] = useState<ApiProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [cachedModels, setCachedModels] = useState<ModelCacheItem[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [modelQuery, setModelQuery] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);
  const [promptProfiles, setPromptProfiles] = useState<PromptProfile[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [sessionApiKey, setSessionApiKey] = useState<string>('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const imageObjectUrls = useRef(new Map<string, string>());
  const modelSearchInputRef = useRef<HTMLInputElement>(null);
  const profileLoadGenerationRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const generation = profileLoadGenerationRef.current;
      let profiles = await apiProfileRepo.getAll();
      if (profiles.length === 0) {
        await apiProfileRepo.save(MOCK_API_PROFILE);
        await apiProfileRepo.saveCachedModels(MOCK_API_PROFILE.id, [
          { id: 'mock-grill-fast', name: 'Grill Simulator (Fast 2-Round)' },
          { id: 'mock-grill-deep', name: 'Grill Simulator (Thorough 3-Round)' },
        ]);
        profiles = await apiProfileRepo.getAll();
      }
      setApiProfiles(profiles);

      const defaultProfile = profiles[0];
      if (defaultProfile) {
        setSelectedProfileId(defaultProfile.id);
        const models = await apiProfileRepo.getCachedModels(defaultProfile.id);
        if (profileLoadGenerationRef.current === generation) {
          setCachedModels(models);
          setSelectedModelId(models.length > 0 ? models[0].modelId : 'gpt-4o');
          setModelsLoading(false);
        }
      } else {
        setModelsLoading(false);
      }

      const prompts = await promptProfileRepo.getAll();
      setPromptProfiles(prompts);
      if (prompts.length > 0) {
        const defaultPrompt = prompts.find((prompt) => prompt.id === DEFAULT_PROMPT_PROFILE_ID) ?? prompts[0];
        setSelectedPromptId(defaultPrompt.id);
      }

      setLoading(false);
    }
    init();
  }, []);

  const handleProfileChange = async (profileId: string) => {
    const generation = ++profileLoadGenerationRef.current;
    setSelectedProfileId(profileId);
    setModelQuery('');
    setCachedModels([]);
    setSelectedModelId('');
    setModelsLoading(true);
    const models = await apiProfileRepo.getCachedModels(profileId);
    if (profileLoadGenerationRef.current !== generation) return;
    setCachedModels(models);
    setSelectedModelId(models.length > 0 ? models[0].modelId : 'gpt-4o');
    setModelsLoading(false);
  };


  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const files: File[] = [];
    if (fileList) {
      for (let index = 0; index < fileList.length; index += 1) {
        const file = fileList.item(index);
        if (file) files.push(file);
      }
    }
    e.target.value = '';
    if (files.length === 0) return;
    setAttachmentError(null);
    const next = [...attachments];
    let totalBytes = next.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
    let firstError: string | null = null;
    for (const file of files) {
      const result = validateAttachmentFile(file, totalBytes, next.length);
      if (!result.valid || !result.kind) {
        if (!firstError) firstError = result.error || '添付ファイルを確認できませんでした。';
        continue;
      }
      const id = `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const draft: AttachmentDraft = { id, name: file.name, mimeType: file.type, sizeBytes: file.size, kind: result.kind, file };
      if (result.kind === 'image') imageObjectUrls.current.set(id, URL.createObjectURL(file));
      else draft.textPreview = (await file.text()).slice(0, 2000);
      next.push(draft);
      totalBytes += file.size;
    }
    setAttachments(next);
    setAttachmentError(firstError);
  };

  const removeAttachment = (id: string) => {
    const objectUrl = imageObjectUrls.current.get(id);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      imageObjectUrls.current.delete(id);
    }
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  };

  useEffect(() => () => {
    imageObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    imageObjectUrls.current.clear();
  }, []);

  const selectedProfile = apiProfiles.find((p) => p.id === selectedProfileId);
  const needsSessionKey =
    selectedProfile &&
    selectedProfile.id !== MOCK_API_PROFILE.id &&
    !selectedProfile.rememberKey &&
    !inMemoryKeyStore.has(selectedProfile.id);

  const normalizedModelQuery = normalizeModelSearchValue(modelQuery);
  const filteredCachedModels = normalizedModelQuery
    ? cachedModels.filter((model) => {
        const normalizedId = normalizeModelSearchValue(model.modelId);
        const normalizedDisplayName = normalizeModelSearchValue(model.displayName);
        return normalizedId.includes(normalizedModelQuery) || normalizedDisplayName.includes(normalizedModelQuery);
      })
    : cachedModels;
  const selectedCachedModel = cachedModels.find((model) => model.modelId === selectedModelId);
  const visibleModels =
    selectedModelId !== '__custom__' && selectedModelId && !filteredCachedModels.some((model) => model.modelId === selectedModelId)
      ? selectedCachedModel
        ? [selectedCachedModel, ...filteredCachedModels]
        : [{ modelId: selectedModelId, displayName: selectedModelId }, ...filteredCachedModels]
      : filteredCachedModels;

  const handleStartGrill = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (modelsLoading) {
      setFormError('モデル一覧の読み込みが完了するまでお待ちください');
      return;
    }
    if (!theme.trim()) {
      setFormError('検討したいテーマを入力してください');
      return;
    }

    if (!selectedProfile) {
      setFormError('API Profile を選択してください');
      return;
    }

    if (needsSessionKey && !sessionApiKey.trim()) {
      setFormError('このAPI Profile用のAPIキーを入力してください');
      return;
    }

    const effectiveModel = selectedModelId === '__custom__' ? customModelInput.trim() : selectedModelId;
    if (!effectiveModel) {
      setFormError('モデルを選択または入力してください');
      return;
    }

    const promptProfile = promptProfiles.find((p) => p.id === selectedPromptId) || promptProfiles[0];
    if (!promptProfile) {
      setFormError('Prompt Profile を選択してください');
      return;
    }

    // Save in-memory key if provided
    if (sessionApiKey.trim()) {
      inMemoryKeyStore.set(selectedProfile.id, sessionApiKey.trim());
    }

    setSubmitting(true);

    const sessionId = 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
    const profileSecrets = [selectedProfile.apiKey, inMemoryKeyStore.get(selectedProfile.id), ...(selectedProfile.headers || []).map((header) => header.value), ...(inMemoryKeyStore.getHeaders(selectedProfile.id) || []).map((header) => header.value)];
    const maskedModel = maskPlainSecrets(effectiveModel, profileSecrets);
    const snapshot: SelectionSnapshot = {
      apiProfileId: selectedProfile.id,
      apiProfileName: selectedProfile.name,
      baseUrl: selectedProfile.baseUrl,
      modelId: maskedModel,
      modelName: maskedModel,
      promptProfileId: promptProfile.id,
      promptProfileName: promptProfile.name,
      depth,
    };

    // Auto title from theme (first line or truncated)
    const title = theme.split('\n')[0].slice(0, 40) || '無題のGrillセッション';

    const newSession: SessionRecord = {
      id: sessionId,
      title,
      theme: theme.trim(),
      status: 'draft',
      selectionSnapshot: snapshot,
      promptSnapshot: promptProfile.systemPrompt,
      messages: [],
      rounds: [],
      decisions: [],
      assumptions: [],
      conflicts: [],
      openIssues: [],
      currentRound: 0,
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await sessionRepo.save(newSession);
      await attachmentRepo.saveMany(sessionId, attachments);
    } catch {
      setFormError('セッションまたは添付ファイルの保存に失敗しました。');
      setSubmitting(false);
      return;
    }

    // Navigate to grill screen
    onNavigate({ route: 'grill', sessionId });
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-400">初期化中...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-semibold tracking-wide">
            <Flame className="w-3.5 h-3.5" />
            対話型要件具体化ツール
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
            曖昧なアイデアを磨き上げ、<br className="hidden sm:block" />
            実行可能なAIエージェント仕様書へ。
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            AIからの鋭い質問と推奨回答を重ねることで、仕様の抜け漏れ・技術的トレードオフを最短で決定。完成した仕様はワンクリックで下流エージェント用プロンプトとして出力されます。
          </p>
        </div>
      </div>

      <form onSubmit={handleStartGrill} className="space-y-6">
        {/* Theme input */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="theme-input" className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-500" />
              1. 検討したいテーマ・作りたいもの *
            </label>
            <span className="text-xs text-slate-400">具体的でも粗削りでもOK</span>
          </div>

          <textarea
            id="theme-input"
            rows={4}
            required
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="例: 「社内用のFAQボットを作りたいが、APIキー管理とセキュリティの要件、およびMVPとしての最小スコープを明確にしたい」"
            className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 leading-relaxed"
          />

          {/* Sample themes */}
          <div className="space-y-1.5 pt-1">
            <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              サンプルのテーマから選ぶ:
            </p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_THEMES.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTheme(s)}
                  className="text-xs bg-slate-100 hover:bg-orange-50 hover:text-orange-700 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors text-left cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <label htmlFor="attachment-input" className="text-sm font-bold text-slate-900">添付ファイル（任意）</label>
          <input id="attachment-input" type="file" multiple accept={ATTACHMENT_ACCEPT_ATTRIBUTE} onChange={handleAttachmentChange} className="w-full text-sm text-slate-700" />
          <p className="text-xs text-slate-500">{describeAttachmentLimits()}</p>
          {attachmentError && <p className="text-sm text-red-600">{attachmentError}</p>}
          {attachments.length > 0 && (
            <ul className="space-y-3">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-start gap-3 border border-slate-200 rounded-xl p-3">
                  {attachment.kind === 'image' ? (
                    <img src={imageObjectUrls.current.get(attachment.id)} alt={attachment.name} className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                  ) : (
                    <pre className="w-32 h-16 overflow-hidden bg-slate-50 rounded-lg p-2 text-[10px] text-slate-600 whitespace-pre-wrap">{attachment.textPreview}</pre>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{attachment.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(attachment.sizeBytes)}</p>
                  </div>
                  <button type="button" onClick={() => removeAttachment(attachment.id)} className="text-xs text-red-600 hover:underline">削除</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Configuration grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Depth selection */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-orange-500" />
              2. ヒアリング深度 (Depth)
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDepth('quick')}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  depth === 'quick'
                    ? 'border-orange-500 bg-orange-50 text-orange-950 font-bold shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="text-sm">Quick</div>
                <div className="text-[11px] text-slate-500 mt-0.5">1〜2回</div>
              </button>

              <button
                type="button"
                onClick={() => setDepth('standard')}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  depth === 'standard'
                    ? 'border-orange-500 bg-orange-50 text-orange-950 font-bold shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="text-sm">Standard</div>
                <div className="text-[11px] text-slate-500 mt-0.5">2〜3回 (推奨)</div>
              </button>

              <button
                type="button"
                onClick={() => setDepth('deep')}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  depth === 'deep'
                    ? 'border-orange-500 bg-orange-50 text-orange-950 font-bold shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="text-sm">Deep</div>
                <div className="text-[11px] text-slate-500 mt-0.5">4〜6回</div>
              </button>
            </div>
            <p className="text-xs text-slate-500">
              ラウンド数を目安とし、AIが十分に仕様が固まったと判断した時点で自動完了します。
            </p>
          </div>

          {/* Prompt profile selection */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-orange-500" />
                3. Prompt Profile
              </label>
              <button
                type="button"
                onClick={() => onNavigate({ route: 'settings-prompts' })}
                className="text-xs text-orange-600 hover:underline font-medium"
              >
                編集・追加
              </button>
            </div>

            <select
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30"
            >
              {promptProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.builtIn ? '(組み込み)' : '(カスタム)'}
                </option>
              ))}
            </select>

            <p className="text-xs text-slate-500 line-clamp-2">
              {promptProfiles.find((p) => p.id === selectedPromptId)?.description}
            </p>
          </div>

          {/* API profile selection */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-orange-500" />
                4. API Profile
              </label>
              <button
                type="button"
                onClick={() => onNavigate({ route: 'settings-apis' })}
                className="text-xs text-orange-600 hover:underline font-medium"
              >
                管理・追加
              </button>
            </div>

            <select
              value={selectedProfileId}
              onChange={(e) => handleProfileChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30"
            >
              {apiProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id === MOCK_API_PROFILE.id ? '内蔵モック' : p.baseUrl})
                </option>
              ))}
            </select>

            {needsSessionKey && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
                <label className="block text-xs font-semibold text-amber-900" htmlFor="session-api-key-input">
                  このセッション用のAPIキー (メモリ内保持)
                </label>
                <input
                  id="session-api-key-input"
                  type="password"
                  placeholder="sk-..."
                  value={sessionApiKey}
                  onChange={(e) => setSessionApiKey(e.target.value)}
                  className="w-full px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-mono bg-white"
                />
                <p className="text-[11px] text-amber-800">
                  ※ このProfileはブラウザ保存が無効のため、現在のタブメモリでのみ利用されます。
                </p>
              </div>
            )}
            <label htmlFor="model-search-input" className="sr-only">モデルを検索</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                ref={modelSearchInputRef}
                id="model-search-input"
                type="search"
                placeholder="モデル名またはIDで検索..."
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                aria-describedby="model-search-status"
                className="w-full pl-10 pr-20 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              />
              {modelQuery && (
                <button type="button" onClick={() => { setModelQuery(''); modelSearchInputRef.current?.focus(); }} className="absolute right-3 top-2.5 text-xs text-orange-600 hover:underline">クリア</button>
              )}
            </div>
            <select
              id="model-select"
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              aria-describedby="model-search-status"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-orange-500/30"
            >
              {visibleModels.map((m, index) => (
                <option key={`${m.modelId}-${index}`} value={m.modelId}>{m.displayName}</option>
              ))}
              <option value="__custom__">-- 手動入力 (直接指定) --</option>
            </select>

            <p id="model-search-status" role="status" aria-live="polite" className="text-xs text-slate-500">
              {modelsLoading ? 'モデル一覧を読み込み中...' : `${filteredCachedModels.length}件のモデルが見つかりました`}
            </p>
            {!modelsLoading && normalizedModelQuery && filteredCachedModels.length === 0 && (
              <div className="text-xs text-slate-500 space-y-2">
                <p>一致するモデルがありません。検索条件をクリアするか、手動入力をお試しください。</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setModelQuery(''); modelSearchInputRef.current?.focus(); }} className="text-orange-600 hover:underline">検索をクリア</button>
                  <button type="button" onClick={() => setSelectedModelId('__custom__')} className="text-orange-600 hover:underline">手動入力を選択</button>
                </div>
              </div>
            )}

            {selectedModelId === '__custom__' && (
              <input
                type="text"
                placeholder="例: gpt-4o-mini, claude-3-5-sonnet, llama-3"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
              />
            )}
            <p className="text-xs text-slate-500">
              {cachedModels.length > 0 ? `${cachedModels.length}件の取得済みモデルから選択中` : 'モデル一覧は「API設定」画面で取得・更新できます'}
            </p>
          </div>
        </div>

        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
            {formError}
          </div>
        )}

        {/* Start button */}
        <div className="flex justify-end pt-2">
          <button
            id="start-grill-btn"
            type="submit"
            disabled={submitting || modelsLoading}
            className="w-full sm:w-auto px-8 py-3.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-base rounded-xl shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer"
          >
            <Flame className="w-5 h-5" />
            <span>Grill を開始する</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
