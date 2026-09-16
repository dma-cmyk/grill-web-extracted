import React, { useState, useEffect, useRef } from 'react';
import { RoutePath } from '../../app/router';
import { Dialog } from '../../components/Dialog';
import { SessionRecord, ChatAttachmentPayload, GrillStatus } from '../../types/session';
import { AttachmentRecord } from '../../types/attachment';
import { QuestionAnswer, GrillRound } from '../../types/grillRound';
import { sessionRepo } from '../../storage/sessionRepo';
import { apiProfileRepo } from '../../storage/apiProfileRepo';
import { attachmentRepo } from '../../storage/attachmentRepo';
import { formatBytes } from '../../core/attachmentValidation';
import { inMemoryKeyStore } from '../../security/inMemoryKeyStore';
import { getProviderForProfile } from '../../providers';
import { buildInitialMessages, buildAnswersMessage, buildFollowUpMessage } from '../../core/promptBuilder';
import { parseAndValidateGrillRound, buildRepairMessage } from '../../core/responseParser';
import { generateAgentHandoffPrompt } from '../../core/handoffGenerator';
import { maskResponseText, maskStreamingText } from '../../security/masking';
import {
  Flame,
  CheckCircle2,
  AlertTriangle,
  StopCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Copy,
  ExternalLink,
  Sliders,
  History,
  Info,
} from 'lucide-react';

interface GrillViewProps {
  sessionId: string;
  onNavigate: (route: RoutePath) => void;
  autoOpenFollowUp?: boolean;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('画像をData URLに変換できませんでした'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('画像を読み込めませんでした'));
    reader.readAsDataURL(blob);
  });
}

const ATTACHMENT_TEXT_PREVIEW_LIMIT = 2000;

interface AttachmentDisplayItem {
  record: AttachmentRecord;
  objectUrl?: string;
  textPreview?: string;
  textPreviewTruncated?: boolean;
  previewError?: string;
}

export const GrillView: React.FC<GrillViewProps> = ({ sessionId, onNavigate, autoOpenFollowUp }) => {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamingText, setStreamingText] = useState<string>('');
  const [currentAnswers, setCurrentAnswers] = useState<Record<string, QuestionAnswer>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rawModalOpen, setRawModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [displayAttachments, setDisplayAttachments] = useState<AttachmentDisplayItem[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpTheme, setFollowUpTheme] = useState('');
  const followUpInFlightRef = useRef(false);
  const sessionRef = useRef<SessionRecord | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Concurrency, abort, and retry request management
  const activeRequestIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<{
    requestSession: SessionRecord;
    baseSession: SessionRecord;
    isRepairAttempt: boolean;
  } | null>(null);

  const attachmentLoadGenerationRef = useRef(0);
  const attachmentObjectUrlsRef = useRef(new Map<string, string>());

  const revokeAttachmentObjectUrls = () => {
    for (const objectUrl of attachmentObjectUrlsRef.current.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    attachmentObjectUrlsRef.current.clear();
  };

  const isCurrentAttachmentLoad = (generation: number) =>
    attachmentLoadGenerationRef.current === generation;

  const loadAttachmentPreviews = async (targetSessionId: string, generation: number) => {
    let attachmentRecords: AttachmentRecord[];
    try {
      attachmentRecords = await attachmentRepo.listBySession(targetSessionId);
    } catch {
      if (!isCurrentAttachmentLoad(generation)) return;
      setDisplayAttachments([]);
      setAttachmentsLoading(false);
      setAttachmentError('添付ファイル一覧の読み込みに失敗しました。セッションの進行は継続します。');
      return;
    }

    if (!isCurrentAttachmentLoad(generation)) return;
    if (attachmentRecords.length === 0) {
      setDisplayAttachments([]);
      setAttachmentsLoading(false);
      return;
    }

    const displayItems: AttachmentDisplayItem[] = [];
    let hasPreviewError = false;

    for (const attachment of attachmentRecords) {
      if (!isCurrentAttachmentLoad(generation)) return;

      if (attachment.kind === 'image') {
        try {
          const objectUrl = URL.createObjectURL(attachment.blob);
          if (!isCurrentAttachmentLoad(generation)) {
            URL.revokeObjectURL(objectUrl);
            return;
          }

          const previousObjectUrl = attachmentObjectUrlsRef.current.get(attachment.id);
          if (previousObjectUrl) {
            URL.revokeObjectURL(previousObjectUrl);
          }
          attachmentObjectUrlsRef.current.set(attachment.id, objectUrl);
          displayItems.push({ record: attachment, objectUrl });
        } catch {
          if (!isCurrentAttachmentLoad(generation)) return;
          hasPreviewError = true;
          displayItems.push({
            record: attachment,
            previewError: '画像を表示できませんでした。',
          });
        }
        continue;
      }

      try {
        const text = await attachment.blob.text();
        if (!isCurrentAttachmentLoad(generation)) return;
        displayItems.push({
          record: attachment,
          textPreview: text.slice(0, ATTACHMENT_TEXT_PREVIEW_LIMIT),
          textPreviewTruncated: text.length > ATTACHMENT_TEXT_PREVIEW_LIMIT,
        });
      } catch {
        if (!isCurrentAttachmentLoad(generation)) return;
        hasPreviewError = true;
        displayItems.push({
          record: attachment,
          previewError: 'テキストを読み込めませんでした。',
        });
      }
    }

    if (!isCurrentAttachmentLoad(generation)) return;
    setDisplayAttachments(displayItems);
    setAttachmentsLoading(false);
    setAttachmentError(
      hasPreviewError
        ? '添付ファイルの表示に失敗したものがあります。セッションの進行は継続します。'
        : null
    );
  };

  // Load session from storage
  const loadSession = async () => {
    const generation = attachmentLoadGenerationRef.current + 1;
    attachmentLoadGenerationRef.current = generation;
    revokeAttachmentObjectUrls();
    setDisplayAttachments([]);
    setAttachmentsLoading(true);
    setAttachmentError(null);
    setLoading(true);

    const s = await sessionRepo.getById(sessionId);
    if (!isCurrentAttachmentLoad(generation)) return;
    if (!s) {
      setAttachmentsLoading(false);
      alert('セッションが見つかりませんでした');
      onNavigate({ route: 'sessions' });
      return;
    }
    sessionRef.current = s;
    setSession(s);
    setLoading(false);
    void loadAttachmentPreviews(sessionId, generation);

    // If session is newly created in 'draft' state, automatically kick off Round 1
    if (s.status === 'draft') {
      await startInitialRound(s);
    }
  };

  useEffect(() => {
    loadSession();
    return () => {
      attachmentLoadGenerationRef.current += 1;
      revokeAttachmentObjectUrls();

      // Clean up any ongoing request on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      activeRequestIdRef.current = null;
    };
  }, [sessionId]);
  // Opens the follow-up composer only when arriving via the /follow-up hash.
  // One-shot per session so a closed composer is never reopened by later
  // state updates, but reset when sessionId changes so a follow-up hash on a
  // different session opens it again. Never submits.
  const autoOpenHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoOpenFollowUp && session?.status === 'completed') {
      if (autoOpenHandledRef.current === sessionId) return;
      autoOpenHandledRef.current = sessionId;
      setFollowUpOpen(true);
    }
  }, [session, autoOpenFollowUp, sessionId]);

  // Update session state in memory and persist in IndexedDB
  const updateSession = async (updater: (prev: SessionRecord) => SessionRecord) => {
    const prev = sessionRef.current;
    if (!prev) return;
    const next = updater(prev);
    sessionRef.current = next;
    setSession(next);
    const save = saveQueueRef.current.then(async () => {
      try {
        await sessionRepo.save(next);
        setSaveError(null);
      } catch {
        setSaveError('セッションの保存に失敗しました。操作は画面上に保持されています。');
      }
    });
    saveQueueRef.current = save;
    await save;
  };

  /**
   * Helper to perform chat completion with the configured provider and model
   */
  const executeLlmCall = async (
    s: SessionRecord,
    requestId: string,
    onProgress: (chunk: string, accumulated: string) => void
  ): Promise<string> => {
    const profile = await apiProfileRepo.getById(s.selectionSnapshot.apiProfileId);
    if (activeRequestIdRef.current !== requestId) {
      throw new DOMException('Aborted by user', 'AbortError');
    }
    if (!profile) {
      throw new Error(`API Profile (${s.selectionSnapshot.apiProfileName}) が見つかりません`);
    }

    const effectiveKey = profile.apiKey || inMemoryKeyStore.get(profile.id);
    const secrets = [effectiveKey, profile.apiKey, ...(profile.headers || []).map((header) => header.value), ...(inMemoryKeyStore.getHeaders(profile.id) || []).map((header) => header.value)];
    if (activeRequestIdRef.current !== requestId) {
      throw new DOMException('Aborted by user', 'AbortError');
    }
    const provider = getProviderForProfile(profile);

    if (activeRequestIdRef.current !== requestId) {
      throw new DOMException('Aborted by user', 'AbortError');
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (activeRequestIdRef.current !== requestId) {
      controller.abort();
      throw new DOMException('Aborted by user', 'AbortError');
    }
    const output = await provider.chat({
      profile,
      apiKey: effectiveKey,
      model: s.selectionSnapshot.modelId,
      messages: s.messages,
      signal: controller.signal,
      onChunk: (chunk, accumulated) => {
        // Discard if superseded by a newer request
        if (activeRequestIdRef.current !== requestId) return;
        onProgress(maskStreamingText(chunk, secrets), maskStreamingText(accumulated, secrets));
      },
    });
    return maskResponseText(output, secrets);
  };

  /**
   * Starts Round 1 from draft
   */
  const startInitialRound = async (s: SessionRecord) => {
    const reqId = 'req-' + Date.now();
    activeRequestIdRef.current = reqId;

    try {
      const attachmentRecords = await attachmentRepo.listBySession(sessionId);
      if (activeRequestIdRef.current !== reqId) return;

      const attachmentPayloads: ChatAttachmentPayload[] = [];
      for (const attachment of attachmentRecords) {
        if (attachment.kind === 'image') {
          const dataUrl = await readBlobAsDataUrl(attachment.blob);
          if (activeRequestIdRef.current !== reqId) return;
          attachmentPayloads.push({
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            kind: attachment.kind,
            dataUrl,
          });
        } else {
          const textContent = await attachment.blob.text();
          if (activeRequestIdRef.current !== reqId) return;
          attachmentPayloads.push({
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            kind: attachment.kind,
            textContent,
          });
        }
      }
      if (activeRequestIdRef.current !== reqId) return;

      const initialMessages = buildInitialMessages(
        s.theme,
        s.selectionSnapshot,
        s.promptSnapshot,
        attachmentPayloads
      );
      if (activeRequestIdRef.current !== reqId) return;

      const updatedSession: SessionRecord = {
        ...s,
        messages: initialMessages,
        status: 'requesting',
        currentRound: 1,
        pendingRepair: undefined,
      };
      await updateSession(() => updatedSession);
      if (activeRequestIdRef.current !== reqId) return;

      setStreamingText('');

      // Step: receiving
      await updateSession((curr) => ({ ...curr, status: 'receiving' }));
      if (activeRequestIdRef.current !== reqId) return;

      lastRequestRef.current = {
        requestSession: updatedSession,
        baseSession: updatedSession,
        isRepairAttempt: false,
      };
      const fullOutput = await executeLlmCall(updatedSession, reqId, (_chunk, accumulated) => {
        setStreamingText(accumulated);
      });

      if (activeRequestIdRef.current !== reqId) return;

      // Step: parsing
      await updateSession((curr) => ({ ...curr, status: 'parsing', lastRawResponse: fullOutput }));
      if (activeRequestIdRef.current !== reqId) return;

      await handleReceivedResponse(fullOutput, updatedSession, reqId, false);
    } catch (err: unknown) {
      if (activeRequestIdRef.current !== reqId) return;
      await handleLlmError(err);
    }
  };

  /**
   * Handles and validates received LLM output with single-shot repair capability
   */
  const handleReceivedResponse = async (
    rawText: string,
    currentSession: SessionRecord,
    reqId: string,
    isRepairAttempt: boolean
  ) => {
    const parseResult = parseAndValidateGrillRound(rawText);

    if (parseResult.success && parseResult.data) {
      const data = parseResult.data;

      // If finished, generate handoff
      const isFinished = data.finished;
      let finalHandoffText = data.finalHandoff || '';

      const newRoundHistory = [
        ...currentSession.rounds,
        {
          round: data.round || currentSession.currentRound,
          grillRound: data,
          ...(currentSession.pendingFollowUpTheme
            ? { followUpTheme: currentSession.pendingFollowUpTheme, handoffSnapshot: currentSession.finalHandoff }
            : {}),
        },
      ];

      const nextDecisions = Array.from(new Set([...currentSession.decisions, ...(data.decisions || [])]));
      const nextAssumptions = Array.from(new Set([...currentSession.assumptions, ...(data.assumptions || [])]));
      const nextConflicts = Array.from(new Set([...currentSession.conflicts, ...(data.conflicts || [])]));
      const nextOpenIssues = Array.from(new Set([...currentSession.openIssues, ...(data.openIssues || [])]));

      const nextStatus: GrillStatus = isFinished ? 'completed' : 'awaiting_answer';

      const nextSession: SessionRecord = {
        ...currentSession,
        status: nextStatus,
        rounds: newRoundHistory,
        currentRound: data.round,
        progress: data.completion.progressPercentage || (isFinished ? 100 : currentSession.progress + 25),
        decisions: nextDecisions,
        assumptions: nextAssumptions,
        conflicts: nextConflicts,
        openIssues: nextOpenIssues,
        lastError: undefined,
        lastRawResponse: rawText,
        pendingRepair: undefined,
        messages: [
          ...currentSession.messages,
          {
            role: 'assistant',
            content: rawText,
            rawJson: parseResult.extractedJson,
            timestamp: Date.now(),
          },
        ],
      };

      if (isFinished) {
        if (!finalHandoffText || finalHandoffText.length < 50) {
          finalHandoffText = generateAgentHandoffPrompt({ ...nextSession, finalHandoff: undefined });
        }
        nextSession.finalHandoff = finalHandoffText;
      }
      if (nextSession.pendingFollowUpTheme !== undefined) {
        nextSession.pendingFollowUpTheme = undefined;
      }

      // Guard against a stale response reaching the first persistence await.
      if (activeRequestIdRef.current !== reqId) return;

      await updateSession(() => nextSession);
      if (activeRequestIdRef.current !== reqId) return;
      setStreamingText('');

      // Initialize answers for the new round's questions
      const initialAnswers: Record<string, QuestionAnswer> = {};
      data.questions.forEach((q) => {
        initialAnswers[q.id] = {
          questionId: q.id,
          question: q.question,
          selectedOption: q.recommendedAnswer || q.options?.[0] || '',
          useRecommended: true,
        };
      });
      setCurrentAnswers(initialAnswers);
    } else {
      // Parsing or validation failed
      if (!isRepairAttempt && parseResult.canRepair) {
        // Attempt single-shot repair as specified in Section 3.5
        console.warn('JSON parsing or validation failed, initiating single-shot repair...');
        if (activeRequestIdRef.current !== reqId) return;
        await attemptRepair(rawText, parseResult.error || 'JSON形式の不一致', currentSession, reqId);
      } else {
        // Repair failed or not applicable
        await updateSession((curr) => ({
          ...curr,
          status: 'recoverable_error',
          lastError: parseResult.error || 'AIレスポンスの構造化スキーマ検証に失敗しました',
          lastRawResponse: rawText,
          pendingRepair: undefined,
        }));
      }
    }
  };

  /**
   * Executes single-shot repair request to LLM
   */
  const attemptRepair = async (
    rawResponse: string,
    validationError: string,
    currentSession: SessionRecord,
    reqId: string
  ) => {
    const repairPrompt = buildRepairMessage(rawResponse, validationError);
    const repairMessages = [
      ...currentSession.messages,
      {
        role: 'assistant' as const,
        content: rawResponse,
        timestamp: Date.now(),
      },
      {
        role: 'user' as const,
        content: repairPrompt,
        timestamp: Date.now() + 1,
      },
    ];

    const sessionWithRepair = {
      ...currentSession,
      messages: repairMessages,
      status: 'receiving' as GrillStatus,
      pendingRepair: true,
    };
    // Retry snapshot must be fixed before the first persistence await so a
    // retry never re-appends the repair message.
    lastRequestRef.current = {
      requestSession: sessionWithRepair,
      baseSession: sessionWithRepair,
      isRepairAttempt: true,
    };
    // Guard against a stale request reaching the first persistence await.
    if (activeRequestIdRef.current !== reqId) return;

    await updateSession(() => sessionWithRepair);
    if (activeRequestIdRef.current !== reqId) return;
    setStreamingText('修復リクエストを実行中...');

    try {
      const repairedOutput = await executeLlmCall(sessionWithRepair, reqId, (_chunk, accumulated) => {
        setStreamingText(accumulated);
      });

      if (activeRequestIdRef.current !== reqId) return;

      await handleReceivedResponse(repairedOutput, sessionWithRepair, reqId, true);
    } catch (err: any) {
      if (activeRequestIdRef.current !== reqId) return;
      await handleLlmError(err);
    }
  };

  /**
   * Handles API/Network errors
   */
  const handleLlmError = async (err: any) => {
    if (err?.name === 'AbortError' || err?.code === 'ABORTED') {
      await updateSession((curr) => ({
        ...curr,
        status: 'aborted',
        lastError: 'リクエストが中断されました',
        pendingRepair: undefined,
      }));
      return;
    }

    const message = err?.message || String(err || '不明なエラーが発生しました');
    await updateSession((curr) => ({
      ...curr,
      status: 'recoverable_error',
      lastError: message,
      pendingRepair: undefined,
    }));
  };

  /**
   * User submits answers to the current round questions
   */
  const handleSubmitAnswers = async () => {
    if (!session || session.status !== 'awaiting_answer') return;

    const currentRoundEntry = session.rounds[session.rounds.length - 1];
    if (!currentRoundEntry) return;

    const answersList: QuestionAnswer[] = Object.values(currentAnswers);
    if (answersList.length === 0) {
      alert('回答を1つ以上入力してください');
      return;
    }

    const reqId = 'req-' + Date.now();
    activeRequestIdRef.current = reqId;

    const answerMsgContent = buildAnswersMessage(session.currentRound, answersList);
    const newMessages = [
      ...session.messages,
      {
        role: 'user' as const,
        content: answerMsgContent,
        timestamp: Date.now(),
      },
    ];

    // Record answers in round history
    const updatedRounds = session.rounds.map((r, idx) => {
      if (idx === session.rounds.length - 1) {
        return {
          ...r,
          answers: answersList,
          submittedAt: Date.now(),
        };
      }
      return r;
    });

    const sessionAfterAnswer: SessionRecord = {
      ...session,
      status: 'requesting',
      messages: newMessages,
      rounds: updatedRounds,
      currentRound: session.currentRound + 1,
      pendingRepair: undefined,
    };

    // Retry snapshot must be fixed before the first persistence await so a
    // retry never re-appends the answer message.
    lastRequestRef.current = {
      requestSession: sessionAfterAnswer,
      baseSession: sessionAfterAnswer,
      isRepairAttempt: false,
    };

    // Guard against a stale request reaching the first persistence await.
    if (activeRequestIdRef.current !== reqId) return;

    await updateSession(() => sessionAfterAnswer);
    if (activeRequestIdRef.current !== reqId) return;
    setStreamingText('');

    try {
      await updateSession((curr) => ({ ...curr, status: 'receiving' }));
      if (activeRequestIdRef.current !== reqId) return;

      const fullOutput = await executeLlmCall(sessionAfterAnswer, reqId, (_chunk, accumulated) => {
        setStreamingText(accumulated);
      });

      if (activeRequestIdRef.current !== reqId) return;

      await updateSession((curr) => ({ ...curr, status: 'parsing', lastRawResponse: fullOutput }));
      if (activeRequestIdRef.current !== reqId) return;

      await handleReceivedResponse(fullOutput, sessionAfterAnswer, reqId, false);
    } catch (err: any) {
      if (activeRequestIdRef.current !== reqId) return;
      await handleLlmError(err);
    }
  };

  /**
   * Starts an additional round on the same session from the completed banner.
   * Builds the follow-up request synchronously, fixes the retry snapshot
   * before the first persistence await, and mirrors the existing
   * request-id / abort / save-queue / stale-guard pattern exactly.
   */
  const startFollowUpRound = async () => {
    const current = sessionRef.current;
    if (!current || current.status !== 'completed' || followUpInFlightRef.current) return;
    followUpInFlightRef.current = true;

    const reqId = 'req-' + Date.now();
    activeRequestIdRef.current = reqId;

    try {
      const theme = followUpTheme.trim();
      // Build the follow-up request synchronously against the existing
      // messages so attachments / prior context are carried without any
      // re-read of attachmentRepo or message rebuild.
      const followUpContent = buildFollowUpMessage(
        current.currentRound + 1,
        theme || undefined,
        current.openIssues
      );

      const requestSession: SessionRecord = {
        ...current,
        status: 'requesting',
        rounds: current.rounds.map((round, index) =>
          index === current.rounds.length - 1
            ? { ...round, handoffSnapshot: current.finalHandoff }
            : round
        ),
        messages: [
          ...current.messages,
          {
            role: 'user',
            content: followUpContent,
            timestamp: Date.now(),
          },
        ],
        pendingRepair: undefined,
        pendingFollowUpTheme: theme || undefined,
        currentRound: current.currentRound + 1,
      };

      // Retry snapshot must be fixed before the first persistence await so a
      // retry resends the follow-up request without re-appending its message.
      lastRequestRef.current = {
        requestSession,
        baseSession: requestSession,
        isRepairAttempt: false,
      };

      await updateSession(() => requestSession);
      if (activeRequestIdRef.current !== reqId) return;
      setStreamingText('');

      await updateSession((curr) => ({ ...curr, status: 'receiving' }));
      if (activeRequestIdRef.current !== reqId) return;

      const fullOutput = await executeLlmCall(requestSession, reqId, (_chunk, accumulated) => {
        setStreamingText(accumulated);
      });

      if (activeRequestIdRef.current !== reqId) return;

      await updateSession((curr) => ({ ...curr, status: 'parsing', lastRawResponse: fullOutput }));
      if (activeRequestIdRef.current !== reqId) return;

      await handleReceivedResponse(fullOutput, requestSession, reqId, false);
      if (activeRequestIdRef.current !== reqId) return;

      // Close the composer and clear the theme only on success.
      setFollowUpOpen(false);
      setFollowUpTheme('');
    } catch (err: unknown) {
      if (activeRequestIdRef.current !== reqId) return;
      await handleLlmError(err);
    } finally {
      followUpInFlightRef.current = false;
    }
  };

  /**
   * User clicks "Accept all recommended answers"
   */
  const handleAcceptAllRecommendations = () => {
    if (!session) return;
    const currentRoundEntry = session.rounds[session.rounds.length - 1];
    if (!currentRoundEntry) return;

    const newAnswers: Record<string, QuestionAnswer> = {};
    currentRoundEntry.grillRound.questions.forEach((q) => {
      newAnswers[q.id] = {
        questionId: q.id,
        question: q.question,
        selectedOption: q.recommendedAnswer || q.options?.[0] || '',
        useRecommended: true,
      };
    });
    setCurrentAnswers(newAnswers);
  };

  /**
   * User aborts current communication
   */
  const handleAbort = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    activeRequestIdRef.current = null;
    await updateSession((curr) => ({
      ...curr,
      status: 'aborted',
      lastError: 'リクエストを中断しました',
    }));
  };

  /**
   * Resends the exact request captured immediately before its original send.
   */
  const resendLastRequest = async (snapshotOverride?: {
    requestSession: SessionRecord;
    baseSession: SessionRecord;
    isRepairAttempt: boolean;
  }) => {
    const snapshot = snapshotOverride || lastRequestRef.current;
    if (!snapshot) return;

    const reqId = 'req-' + Date.now();
    activeRequestIdRef.current = reqId;
    setStreamingText('');

    try {
      await updateSession((curr) => ({ ...curr, status: 'requesting' }));
      if (activeRequestIdRef.current !== reqId) return;
      await updateSession((curr) => ({ ...curr, status: 'receiving' }));
      if (activeRequestIdRef.current !== reqId) return;

      const fullOutput = await executeLlmCall(snapshot.requestSession, reqId, (_chunk, accumulated) => {
        setStreamingText(accumulated);
      });

      if (activeRequestIdRef.current !== reqId) return;

      await updateSession((curr) => ({ ...curr, status: 'parsing', lastRawResponse: fullOutput }));
      if (activeRequestIdRef.current !== reqId) return;
      await handleReceivedResponse(fullOutput, snapshot.baseSession, reqId, snapshot.isRepairAttempt);
    } catch (err: unknown) {
      if (activeRequestIdRef.current !== reqId) return;
      await handleLlmError(err);
    }
  };

  /**
   * User retries the last action from recoverable error or aborted state
   */
  const handleRetry = async () => {
    if (!session) return;
    if (session.rounds.length === 0) {
      await startInitialRound(session);
    } else {
      const snapshot = lastRequestRef.current || {
        requestSession: session,
        baseSession: session,
        isRepairAttempt: !!session.pendingRepair,
      };
      await resendLastRequest(snapshot);
    }
  };
  const handleCopyHandoff = () => {
    if (!session?.finalHandoff) return;
    navigator.clipboard.writeText(session.finalHandoff);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  if (loading || !session) {
    return <div className="text-center py-20 text-slate-400">セッションを読み込み中...</div>;
  }

  const currentRoundEntry = session.rounds[session.rounds.length - 1];
  const currentQuestions = currentRoundEntry?.grillRound.questions || [];
  const isCommunicating = session.status === 'requesting' || session.status === 'receiving' || session.status === 'parsing';

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate max-w-md sm:max-w-lg">
              {session.title}
            </h1>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                session.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : isCommunicating
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                  : session.status === 'recoverable_error'
                  ? 'bg-red-100 text-red-800 border border-red-300'
                  : 'bg-orange-100 text-orange-800 border border-orange-300'
              }`}
            >
              {session.status === 'completed'
                ? '✓ 完了 (Finished)'
                : isCommunicating
                ? 'AI思考・生成中...'
                : session.status === 'recoverable_error'
                ? 'エラー発生'
                : `Round ${session.currentRound} 回答待機中`}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
            <span>Model: <strong className="text-slate-700 font-mono">{session.selectionSnapshot.modelName}</strong></span>
            <span>API: <strong className="text-slate-700">{session.selectionSnapshot.apiProfileName}</strong></span>
            <span>Depth: <strong className="text-slate-700 uppercase">{session.selectionSnapshot.depth}</strong></span>
          </div>
        </div>

        {/* Progress bar & Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-32 sm:w-40 space-y-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-600">
              <span>進捗度</span>
              <span>{session.progress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-orange-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, session.progress))}%` }}
              />
            </div>
          </div>

          {isCommunicating && (
            <button
              onClick={handleAbort}
              className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-red-600 hover:text-red-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <StopCircle className="w-4 h-4" />
              <span>中断</span>
            </button>
          )}

          {session.status === 'completed' && (
            <button
              onClick={() => onNavigate({ route: 'handoff', sessionId: session.id })}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>成果物 Handoff を見る</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {(attachmentsLoading || displayAttachments.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">添付ファイル</h2>
            {attachmentsLoading && <span className="text-xs text-slate-500">読み込み中...</span>}
          </div>

          {attachmentsLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>添付ファイルを読み込んでいます...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayAttachments.map((attachment) => {
                const { record } = attachment;
                return (
                  <div key={record.id} className="border border-slate-200 rounded-xl p-3 space-y-3 bg-slate-50/50">
                    {record.kind === 'image' ? (
                      attachment.objectUrl ? (
                        <img
                          src={attachment.objectUrl}
                          alt={record.name}
                          className="w-full h-40 object-contain rounded-lg bg-white border border-slate-200"
                        />
                      ) : (
                        <div className="h-40 flex items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-500">
                          画像プレビューを読み込めませんでした
                        </div>
                      )
                    ) : (
                      <pre className="h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white border border-slate-200 p-3 text-xs leading-relaxed text-slate-700">
                        {attachment.textPreview || '(本文なし)'}
                        {attachment.textPreviewTruncated ? '\n…' : ''}
                      </pre>
                    )}

                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate" title={record.name}>
                        {record.name}
                      </p>
                      <p className="text-xs text-slate-500">{formatBytes(record.sizeBytes)}</p>
                    </div>

                    {attachment.previewError && (
                      <p className="text-xs text-amber-700" role="status">
                        {attachment.previewError}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {attachmentError && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-sm text-amber-900" role="alert">
          {attachmentError}
        </div>
      )}
      {saveError && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-sm text-amber-900" role="alert">
          セッションの保存に失敗しました。操作は画面上に保持されています。
        </div>
      )}

      {/* Recoverable Error Callout */}
      {(session.status === 'recoverable_error' || session.status === 'aborted') && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-bold text-red-900">通信または応答処理でエラーが発生しました</h3>
              <p className="text-xs text-red-700 leading-relaxed font-mono">
                {session.lastError || '不明なエラー'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>再試行する</span>
            </button>
            {session.lastRawResponse && (
              <button
                onClick={() => setRawModalOpen(true)}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg cursor-pointer"
              >
                AIの生出力を確認 (Raw)
              </button>
            )}
            <button
              onClick={async () => { await updateSession((curr) => ({ ...curr, status: 'awaiting_answer' })); }}
              className="px-3 py-2 text-slate-600 hover:text-slate-900 text-xs font-medium cursor-pointer"
            >
              手動で回答へ進む
            </button>
          </div>
        </div>
      )}

      {/* Completion Banner */}
      {session.status === 'completed' && (
        <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-emerald-500/15 border border-emerald-300 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-emerald-950">Grillセッションが完了しました！</h2>
                <p className="text-xs text-emerald-800 mt-0.5">
                  十分な要件と決定事項が整理されました。下流のAIエージェントへ引き継ぐ実行用プロンプトが生成されています。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!followUpOpen && (
                <button
                  onClick={() => setFollowUpOpen(true)}
                  className="px-3 py-2 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span>続けて検討する</span>
                </button>
              )}
              <button
                onClick={handleCopyHandoff}
                className="px-3 py-2 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>{copySuccess ? 'コピー完了！' : 'プロンプトをコピー'}</span>
              </button>
              <button
                onClick={() => onNavigate({ route: 'handoff', sessionId: session.id })}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span>Handoff画面を開く</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {followUpOpen && (
            <div className="border-t border-emerald-200/70 pt-4 space-y-3">
              <p className="text-xs text-emerald-800 leading-relaxed">
                未解決事項がある場合は、そのまま続けて検討できます。追加で検討したいテーマがあれば任意で入力してください。未入力でも未解決事項の深掘りを優先して続行します。
              </p>
              <textarea
                value={followUpTheme}
                onChange={(e) => setFollowUpTheme(e.target.value)}
                placeholder="追加で検討したいテーマ（任意。例: 運用時の監視方針を詰めたい）"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/30"
              />
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => setFollowUpOpen(false)}
                  className="px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  onClick={startFollowUpRound}
                  disabled={isCommunicating}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Flame className="w-4 h-4" />
                  <span>追加ラウンドを開始</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Grid: Left for Q&A, Right for Status/Decisions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Columns: Questions & Streaming */}
        <div className="lg:col-span-2 space-y-6">
          {/* Live Streaming display */}
          {isCommunicating && (
            <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 shadow-lg border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                <span className="flex items-center gap-2 text-orange-400 font-semibold">
                  <Flame className="w-4 h-4 animate-bounce" />
                  AIがヒアリング質問・要件を精査中...
                </span>
                <span>{session.status}</span>
              </div>
              <div className="text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed text-slate-300">
                {streamingText || '接続確立中...'}
              </div>
            </div>
          )}

          {/* Current Questions Form */}
          {session.status === 'awaiting_answer' && currentQuestions.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-orange-500" />
                    Round {session.currentRound} のヒアリング質問
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    選択肢をクリックするか、自由記述で回答してください。推奨回答をワンクリックで一括採用することもできます。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAcceptAllRecommendations}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>すべての推奨を採用</span>
                </button>
              </div>

              {/* Questions List */}
              <div className="space-y-6">
                {currentQuestions.map((q, idx) => {
                  const ans = currentAnswers[q.id] || {
                    questionId: q.id,
                    question: q.question,
                    selectedOption: q.recommendedAnswer || '',
                    useRecommended: true,
                  };

                  const isCustomMode = !q.options?.includes(ans.selectedOption || '') && !!ans.customAnswer;

                  return (
                    <div
                      key={q.id}
                      className="border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5 bg-slate-50/50 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                            {q.category || '要件'}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            Q{idx + 1}. {q.question}
                          </h3>
                        </div>
                      </div>

                      {/* Options */}
                      {q.options && q.options.length > 0 && (
                        <div className="grid gap-2">
                          {q.options.map((opt, optIdx) => {
                            const isRecommended = opt === q.recommendedAnswer;
                            const isSelected = ans.selectedOption === opt && !isCustomMode;

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                onClick={() =>
                                  setCurrentAnswers((prev) => ({
                                    ...prev,
                                    [q.id]: {
                                      ...ans,
                                      selectedOption: opt,
                                      customAnswer: '',
                                      useRecommended: isRecommended,
                                    },
                                  }))
                                }
                                className={`w-full p-3 rounded-xl border text-left text-xs transition-all flex items-start justify-between gap-3 cursor-pointer ${
                                  isSelected
                                    ? 'bg-orange-50/80 border-orange-500 ring-2 ring-orange-500/20 text-orange-950 font-semibold'
                                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                      isSelected ? 'border-orange-600 bg-orange-600' : 'border-slate-300'
                                    }`}
                                  >
                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                  <span>{opt}</span>
                                </div>

                                {isRecommended && (
                                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                    💡 AI推奨
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Recommended Explanation Callout */}
                      {q.recommendedAnswer && q.explanation && (
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-2.5 text-xs text-amber-900 flex items-start gap-2">
                          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold">推奨理由: </span>
                            <span className="text-amber-800">{q.explanation}</span>
                          </div>
                        </div>
                      )}

                      {/* Custom Answer input */}
                      <div className="pt-1">
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          または自由記述で回答（選択肢以外の指定・補足）:
                        </label>
                        <input
                          type="text"
                          placeholder="例: 上記選択肢に加え、初期はCLIツールとしての提供も考慮する"
                          value={ans.customAnswer || ''}
                          onChange={(e) =>
                            setCurrentAnswers((prev) => ({
                              ...prev,
                              [q.id]: {
                                ...ans,
                                customAnswer: e.target.value,
                                useRecommended: false,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/30"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Submit answers action */}
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  id="submit-answers-btn"
                  onClick={handleSubmitAnswers}
                  className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm rounded-xl shadow-md shadow-orange-600/20 flex items-center gap-2 cursor-pointer transition-transform active:scale-98"
                >
                  <span>回答を送信して次のRoundへ進む</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Past Rounds History (Collapsible) */}
          {session.rounds.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <button
                type="button"
                onClick={() => setHistoryOpen(!historyOpen)}
                className="w-full flex items-center justify-between text-left text-sm font-bold text-slate-900 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-orange-500" />
                  <span>過去のヒアリング履歴 ({session.rounds.length} ラウンド)</span>
                </div>
                {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {historyOpen && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                  {session.rounds.map((r, rIdx) => (
                    <div key={rIdx} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span>Round {r.round}</span>
                        <span className="text-slate-400">進捗: {r.grillRound.completion?.progressPercentage || 0}%</span>
                      </div>
                      {(r.followUpTheme || r.handoffSnapshot) && (
                        <div className="border border-orange-200 bg-orange-50/50 rounded-lg p-2.5 space-y-1.5 max-h-40 overflow-y-auto">
                          {r.followUpTheme && (
                            <p className="text-xs">
                              <span className="font-bold text-orange-900">追加テーマ: </span>
                              <span className="text-orange-900">{r.followUpTheme}</span>
                            </p>
                          )}
                          {r.handoffSnapshot && (
                            <div className="text-xs">
                              <span className="font-bold text-emerald-800">当時のHandoff: </span>
                              <pre className="whitespace-pre-wrap break-words font-sans text-slate-700 mt-1 leading-relaxed">
                                {r.handoffSnapshot}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {r.grillRound.questions.map((q, qIdx) => {
                          const userAns = r.answers?.[qIdx];
                          const answerDisplay = userAns?.useRecommended
                            ? `[推奨採用] ${q.recommendedAnswer}`
                            : userAns?.customAnswer || userAns?.selectedOption || '(回答済)';

                          return (
                            <div key={qIdx} className="bg-slate-50 p-2.5 rounded-lg text-xs space-y-1">
                              <p className="font-semibold text-slate-800">Q: {q.question}</p>
                              <p className="text-slate-600">A: {answerDisplay}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 1 Column: Decisions, Assumptions, Conflicts, Open Issues */}
        <div className="space-y-5">
          {/* Decisions Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              確定事項 (Decisions)
            </h3>
            {session.decisions.length === 0 ? (
              <p className="text-xs text-slate-400 italic">ヒアリングが進むと確定事項が追加されます</p>
            ) : (
              <ul className="space-y-2">
                {session.decisions.map((d, idx) => (
                  <li key={idx} className="text-xs text-slate-800 bg-emerald-50/80 border border-emerald-200 rounded-lg p-2.5 leading-relaxed">
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Assumptions Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-sky-600" />
              前提・仮定 (Assumptions)
            </h3>
            {session.assumptions.length === 0 ? (
              <p className="text-xs text-slate-400 italic">置かれている前提条件が表示されます</p>
            ) : (
              <ul className="space-y-2">
                {session.assumptions.map((a, idx) => (
                  <li key={idx} className="text-xs text-slate-800 bg-sky-50/80 border border-sky-200 rounded-lg p-2.5 leading-relaxed">
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Conflicts Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              矛盾・調整事項 (Conflicts)
            </h3>
            {session.conflicts.length === 0 ? (
              <p className="text-xs text-slate-400 italic">競合やトレードオフはありません</p>
            ) : (
              <ul className="space-y-2">
                {session.conflicts.map((c, idx) => (
                  <li key={idx} className="text-xs text-slate-800 bg-amber-50/80 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Open Issues Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-purple-600" />
              未解決事項 (Open Issues)
            </h3>
            {session.openIssues.length === 0 ? (
              <p className="text-xs text-slate-400 italic">未解決事項はありません</p>
            ) : (
              <ul className="space-y-2">
                {session.openIssues.map((o, idx) => (
                  <li key={idx} className="text-xs text-slate-800 bg-purple-50/80 border border-purple-200 rounded-lg p-2.5 leading-relaxed">
                    {o}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Raw Output Modal */}
      {rawModalOpen && (
        <Dialog
          onClose={() => setRawModalOpen(false)}
          titleId="grill-raw-title"
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
          panelClassName="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 id="grill-raw-title" className="text-base font-bold text-slate-900">
              AI生出力 (Raw Response)
            </h3>
            <button
              onClick={() => setRawModalOpen(false)}
              className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
            >
              ✕ 閉じる
            </button>
          </div>
          <div className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
            {session.lastRawResponse || '(出力なし)'}
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setRawModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
};
