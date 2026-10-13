import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { log } from '@/lib/logger';
import { MAX_PTT_DURATION_SEC } from '@/lib/audio/pttLimits';

interface UseAudioRecorderOptions {
  onRecordingComplete?: (audioBlob: Blob, audioUrl: string) => void;
  /** Duração máxima de gravação, em segundos. */
  maxDuration?: number;
  /**
   * Dono do rascunho. Ausente, o hook resolve o usuário da sessão atual
   * (SEC-FRONTEND-03: rascunho sem dono não pode reaparecer para outro login).
   */
  userId?: string | null;
  /** Store do rascunho; injetável para teste (o default é IndexedDB). */
  drafts?: RecordingDraftStore;
  /** Chamado quando o descarte deixa de ser desfazível (fim da janela de 5 s). */
  onDiscardCommitted?: () => void;
}

/** Rascunho de gravação em disco — sobrevive a reload e a troca de conversa. */
export interface RecordingDraft {
  userId: string;
  blob: Blob;
  createdAt: number;
}

/** Acesso ao rascunho recuperável. Toda operação é tolerante a falha. */
export interface RecordingDraftStore {
  save(draft: RecordingDraft): Promise<void>;
  load(userId: string): Promise<RecordingDraft | null>;
  clear(userId: string): Promise<void>;
}

/**
 * Janela do rascunho órfão (PD-63): o áudio de um usuário não fica em disco para
 * sempre — passado o prazo, o rascunho é descartado na leitura.
 */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** Janela em que o descarte pode ser desfeito. */
export const UNDO_DISCARD_MS = 5000;
/** Tentativas de envio antes de marcar erro definitivo (1 envio + 2 retentativas). */
export const SEND_ATTEMPTS = 3;
/** Espera progressiva entre as tentativas. */
export const SEND_BACKOFF_MS = [1000, 2000, 4000];

const DB_NAME = 'zapp.audio.drafts';
const STORE_NAME = 'drafts';

/** Store real: IndexedDB, uma gravação por usuário. Sem IndexedDB (SSR/private), no-op. */
export const indexedDbDraftStore: RecordingDraftStore = {
  async save(draft) {
    const db = await openDraftDb();
    if (!db) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(draft);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      log.warn('[useAudioRecorder] falha ao salvar rascunho', error);
    } finally {
      db.close();
    }
  },

  async load(userId) {
    const db = await openDraftDb();
    if (!db) return null;
    try {
      return await new Promise<RecordingDraft | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(userId);
        request.onsuccess = () => resolve((request.result as RecordingDraft | undefined) ?? null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      log.warn('[useAudioRecorder] falha ao ler rascunho', error);
      return null;
    } finally {
      db.close();
    }
  },

  async clear(userId) {
    const db = await openDraftDb();
    if (!db) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(userId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      log.warn('[useAudioRecorder] falha ao limpar rascunho', error);
    } finally {
      db.close();
    }
  },
};

function openDraftDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Identidade do dono do rascunho. Lê a sessão (barato, local) e nunca lança:
 * sem sessão o hook simplesmente não persiste nada.
 */
async function resolveSessionUserId(): Promise<string | null> {
  try {
    const client = supabase as unknown as {
      auth?: { getSession?: () => Promise<{ data?: { session?: { user?: { id?: string } } | null } }> };
    };
    const response = await client.auth?.getSession?.();
    return response?.data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Converte uma amostra de níveis (0..1) em alturas de barra determinísticas.
 * Puro: mesma entrada, mesmas alturas — nada de `Math.random()` no render.
 */
export function levelBufferToHeights(
  levels: number[],
  bars: number,
  min = 4,
  max = 28,
): number[] {
  if (bars <= 0) return [];
  if (levels.length === 0) return Array.from({ length: bars }, () => min);
  return Array.from({ length: bars }, (_, i) => {
    const sample = levels[Math.floor((i / bars) * levels.length)] ?? 0;
    const clamped = Math.min(1, Math.max(0, sample));
    return Math.round(min + clamped * (max - min));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Envia com espera progressiva. Só desiste depois de `attempts` tentativas —
 * a falha entre tentativas é transitória e não pode custar a gravação.
 * Devolve `true` quando o envio confirmou.
 */
export async function sendWithBackoff(
  send: () => Promise<unknown>,
  options: {
    attempts?: number;
    backoffMs?: number[];
    onRetry?: (attempt: number, waitMs: number) => void;
  } = {},
): Promise<boolean> {
  const attempts = options.attempts ?? SEND_ATTEMPTS;
  const backoff = options.backoffMs ?? SEND_BACKOFF_MS;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await send();
      return true;
    } catch (error) {
      if (attempt >= attempts) {
        log.error('[useAudioRecorder] envio falhou em todas as tentativas', error);
        return false;
      }
      const waitMs = backoff[Math.min(attempt - 1, backoff.length - 1)];
      options.onRetry?.(attempt, waitMs);
      await sleep(waitMs);
    }
  }
  return false;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const {
    onRecordingComplete,
    maxDuration = MAX_PTT_DURATION_SEC,
    userId: userIdOption,
    drafts = indexedDbDraftStore,
    onDiscardCommitted,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<RecordingDraft | null>(null);
  // Só depois de olhar o disco é que o dono pode abrir o microfone: senão uma
  // gravação órfã seria sobrescrita por uma nova no mesmo instante.
  const [draftChecked, setDraftChecked] = useState(false);
  const [discardedDraft, setDiscardedDraft] = useState<RecordingDraft | null>(null);
  const [discardSecondsLeft, setDiscardSecondsLeft] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(false);
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  const maxDurationRef = useRef(maxDuration);
  const onDiscardCommittedRef = useRef(onDiscardCommitted);
  const userIdRef = useRef<string | null>(userIdOption ?? null);
  const draftsRef = useRef(drafts);
  const recoveredRef = useRef<RecordingDraft | null>(null);
  const discardedRef = useRef<RecordingDraft | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  const undoCommitRef = useRef<NodeJS.Timeout | null>(null);
  const undoTickRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    onRecordingCompleteRef.current = onRecordingComplete;
    maxDurationRef.current = maxDuration;
    onDiscardCommittedRef.current = onDiscardCommitted;
    draftsRef.current = drafts;
  });

  const buildBlobFromChunks = useCallback(() => {
    if (chunksRef.current.length === 0) return null;
    return new Blob(chunksRef.current, { type: 'audio/webm' });
  }, []);

  const persistDraft = useCallback((blob: Blob) => {
    const userId = userIdRef.current;
    if (!userId || blob.size === 0) return;
    void draftsRef.current.save({ userId, blob, createdAt: Date.now() });
  }, []);

  const stopAnalyser = useCallback(() => {
    analyserRef.current = null;
    levelDataRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context) {
      try {
        void context.close();
      } catch {
        // contexto já fechado/indisponível: a captura não depende dele
      }
    }
  }, []);

  // Libera timer, recorder e microfone olhando so para refs, nunca para estado
  // capturado num render antigo (era a causa de o limite de duracao e o unmount
  // nao pararem a captura). `emiteResultado` decide se o onstop entrega o audio:
  // stop entrega; cancel e unmount descartam. Idempotente: com os refs nulos a
  // segunda chamada e um no-op.
  const releaseCapture = useCallback((emiteResultado: boolean) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    stopAnalyser();
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder) {
      if (!emiteResultado) {
        recorder.onstop = null;
      }
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // stop() fora do estado valido lanca InvalidStateError; a liberacao segue.
        }
      }
    }
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
  }, [stopAnalyser]);

  const stopRecording = useCallback(() => {
    releaseCapture(true);
    setIsRecording(false);
    setIsPaused(false);
  }, [releaseCapture]);

  const clearUndoTimers = useCallback(() => {
    if (undoCommitRef.current) {
      clearTimeout(undoCommitRef.current);
      undoCommitRef.current = null;
    }
    if (undoTickRef.current) {
      clearInterval(undoTickRef.current);
      undoTickRef.current = null;
    }
  }, []);

  /**
   * Abre a janela de desfazer do descarte. Enquanto ela corre, o rascunho fica
   * no store e na memória; no fim, o rascunho só permanece no store (recuperável).
   */
  const startUndoWindow = useCallback(() => {
    clearUndoTimers();
    setDiscardSecondsLeft(Math.ceil(UNDO_DISCARD_MS / 1000));
    undoTickRef.current = setInterval(() => {
      setDiscardSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    undoCommitRef.current = setTimeout(() => {
      clearUndoTimers();
      discardedRef.current = null;
      setDiscardedDraft(null);
      setDiscardSecondsLeft(0);
      onDiscardCommittedRef.current?.();
    }, UNDO_DISCARD_MS);
  }, [clearUndoTimers]);

  const cancelRecording = useCallback(() => {
    const captured = buildBlobFromChunks();
    releaseCapture(false);
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    setAudioUrl(null);
    chunksRef.current = [];

    // Gravação em andamento usa o que já foi capturado; gravação já parada (na
    // prévia) usa o blob guardado. Sem áudio, não há o que desfazer.
    const blob = captured ?? lastBlobRef.current;
    lastBlobRef.current = null;
    if (!blob || blob.size === 0) return;

    const userId = userIdRef.current;
    const draft: RecordingDraft = { userId: userId ?? '', blob, createdAt: Date.now() };
    if (userId) {
      void draftsRef.current.save(draft);
    }
    discardedRef.current = draft;
    setDiscardedDraft(draft);
    startUndoWindow();
  }, [buildBlobFromChunks, releaseCapture, startUndoWindow]);

  /** Desfaz o descarte: o áudio volta para a prévia, pronto para enviar. */
  const undoDiscard = useCallback(() => {
    const draft = discardedRef.current;
    clearUndoTimers();
    discardedRef.current = null;
    setDiscardedDraft(null);
    setDiscardSecondsLeft(0);
    if (!draft) return;

    if (draft.userId) {
      void draftsRef.current.clear(draft.userId);
    }
    const url = URL.createObjectURL(draft.blob);
    setAudioUrl(url);
    onRecordingCompleteRef.current?.(draft.blob, url);
  }, [clearUndoTimers]);

  /** Chamado pelo dono depois de usar (enviar) o rascunho recuperado. */
  const clearDraft = useCallback(() => {
    const userId = userIdRef.current;
    if (userId) {
      void draftsRef.current.clear(userId);
    }
    lastBlobRef.current = null;
    recoveredRef.current = null;
    setRecoveredDraft(null);
  }, []);

  /** Recupera o rascunho órfão para a prévia (envio ou descarte ficam com o usuário). */
  const acceptRecoveredDraft = useCallback(() => {
    const draft = recoveredRef.current;
    if (!draft) return;
    recoveredRef.current = null;
    setRecoveredDraft(null);
    // O rascunho saiu do disco e está na mão do usuário: apagar daqui evita
    // que ele reapareça como órfão na próxima abertura.
    if (draft.userId) {
      void draftsRef.current.clear(draft.userId);
    }
    lastBlobRef.current = draft.blob;
    const url = URL.createObjectURL(draft.blob);
    setAudioUrl(url);
    onRecordingCompleteRef.current?.(draft.blob, url);
  }, []);

  const dismissRecoveredDraft = useCallback(() => {
    recoveredRef.current = null;
    setRecoveredDraft(null);
    clearDraft();
  }, [clearDraft]);

  const startAnalyser = useCallback((stream: MediaStream) => {
    try {
      const scope = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
      if (!Ctor) return;
      const context = new Ctor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      levelDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch (error) {
      log.warn('[useAudioRecorder] analisador indisponível; waveform fica estático', error);
    }
  }, []);

  /**
   * Nível de áudio atual (0..1). `-1` quando não há analisador (ambiente sem
   * AudioContext, ex.: jsdom): o componente então mantém o waveform animado fixo.
   */
  const getLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    const data = levelDataRef.current;
    if (!analyser || !data) return -1;
    try {
      analyser.getByteFrequencyData(data);
    } catch {
      return -1;
    }
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) sum += data[i];
    return sum / (data.length * 255);
  }, []);

  const startTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      setDuration((prev) => {
        if (prev >= maxDurationRef.current) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  }, [stopRecording]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    try {
      recorder.pause();
    } catch {
      return;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPaused(true);
  }, []);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    try {
      recorder.resume();
    } catch {
      return;
    }
    setIsPaused(false);
    startTimer();
  }, [startTimer]);

  const startRecording = useCallback(async () => {
    releaseCapture(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // A permissao pode resolver depois do desmonte: devolve a stream na hora.
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      chunksRef.current = [];

      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        throw error;
      }

      mediaRecorderRef.current = mediaRecorder;
      startAnalyser(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (!mountedRef.current) {
          return;
        }
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        lastBlobRef.current = audioBlob;
        setAudioUrl(url);
        // Rascunho desde a gravação concluída: sair da conversa antes de enviar
        // não pode custar o áudio.
        persistDraft(audioBlob);
        onRecordingCompleteRef.current?.(audioBlob, url);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      startTimer();

    } catch (error) {
      log.error('Error starting recording:', error);
      toast({
        title: 'Erro ao gravar',
        description: 'Não foi possível acessar o microfone.',
        variant: 'destructive',
      });
    }
  }, [persistDraft, releaseCapture, startAnalyser, startTimer]);

  // Dono do rascunho + leitura do órfão na montagem (a janela do PD-63 manda no
  // que ainda pode ser recuperado; fora dela o rascunho é descartado na leitura).
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const userId = userIdOption ?? (await resolveSessionUserId());
      userIdRef.current = userId;
      if (!userId) {
        setDraftChecked(true);
        return;
      }

      const draft = await draftsRef.current.load(userId);
      if (draft && Date.now() - draft.createdAt > DRAFT_TTL_MS) {
        await draftsRef.current.clear(userId);
      } else if (draft && !cancelled && mountedRef.current) {
        recoveredRef.current = draft;
        setRecoveredDraft(draft);
      }
      if (!cancelled) setDraftChecked(true);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userIdOption]);

  // Desmontar no meio da gravacao (trocar de contato, fechar o composer) libera
  // microfone, recorder e timer pelo ref real — sem depender do isRecording.
  // O trecho já capturado vira rascunho recuperável em vez de sumir.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const blob = buildBlobFromChunks();
      releaseCapture(false);
      chunksRef.current = [];
      if (blob) persistDraft(blob);
      clearUndoTimers();
      // Saiu da tela no meio da janela de desfazer: o dono precisa saber que a
      // gravação fechou (o áudio continua no disco, recuperável).
      if (discardedRef.current) {
        discardedRef.current = null;
        onDiscardCommittedRef.current?.();
      }
    };
  }, [buildBlobFromChunks, clearUndoTimers, persistDraft, releaseCapture]);

  const uploadAudio = useCallback(async (blob: Blob, conversationId: string) => {
    const fileName = `${conversationId}/${Date.now()}.webm`;

    const { error } = await supabase.storage
      .from('audio-messages')
      .upload(fileName, blob, {
        contentType: 'audio/webm',
      });

    if (error) {
      throw error;
    }

    // A signed URL is a one-hour credential, not durable message data. Store
    // the object locator and sign it at read/send time instead.
    const { data: publicUrlData } = supabase.storage
      .from('audio-messages')
      .getPublicUrl(fileName);

    if (!publicUrlData?.publicUrl) {
      throw new Error('Failed to create audio object reference');
    }

    return publicUrlData.publicUrl;
  }, []);

  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    isRecording,
    isPaused,
    duration,
    audioUrl,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    undoDiscard,
    discardedDraft,
    discardSecondsLeft,
    recoveredDraft,
    draftChecked,
    acceptRecoveredDraft,
    dismissRecoveredDraft,
    clearDraft,
    getLevel,
    uploadAudio,
    formatDuration,
  };
}
