/**
 * CV-070 — Ditado por voz para o RADAR.
 *
 * O vendedor fala uma instrução (ex.: "responde que o prazo é 15 dias úteis
 * e pergunta a quantidade") e o RADAR monta a mensagem, reutilizando a
 * transcrição existente (`ai-transcribe-audio`).
 *
 * Fluxo:
 *   1. Vendedor pressiona o botão de voz no RADAR.
 *   2. Grava via `MediaRecorder` (webm/ogg).
 *   3. Envia o blob para `ai-transcribe-audio`.
 *   4. A transcrição é processada pelo RADAR: envia para `ai-suggest-reply`
 *      com o texto transcrito como instrução explícita.
 *   5. A resposta gerada é colocada no rascunho (nunca enviada).
 */
import { useState, useRef, useCallback } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';
import { createLogger } from '@/lib/logger';

const log = createLogger('useVoiceDictation');

export type DictationState = 'idle' | 'recording' | 'transcribing' | 'generating' | 'error';

export interface UseVoiceDictationOptions {
  contactId: string;
  contactName: string;
  /** Mensagens recentes da conversa para contexto. */
  messages: Array<{ content: string; sender: string }>;
  /** Callback chamado quando o RADAR gerou a mensagem a partir do ditado. */
  onResult: (text: string) => void;
  /** Flag para desabilitar. */
  enabled?: boolean;
}

export interface UseVoiceDictationReturn {
  state: DictationState;
  errorMessage: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  /** Duração atual da gravação em segundos. */
  durationSeconds: number;
}

export function useVoiceDictation({
  contactId,
  contactName,
  messages,
  onResult,
  enabled = true,
}: UseVoiceDictationOptions): UseVoiceDictationReturn {
  const [state, setState] = useState<DictationState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setDurationSeconds(0);
  }, []);

  const cancelRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    cleanup();
    setState('idle');
    setErrorMessage(null);
  }, [cleanup]);

  /** Processa o blob gravado: transcreve e então gera a mensagem. */
  const processAudio = useCallback(
    async (blob: Blob) => {
      setState('transcribing');
      try {
        // 1. Transcrição via ai-transcribe-audio.
        const formData = new FormData();
        formData.append('audio', blob, 'dictation.webm');
        const { data: transcribeData, error: transcribeError } = await invokeEdge<{
          transcription?: string;
          text?: string;
        }>('ai-transcribe-audio', { body: formData });

        if (transcribeError || (!transcribeData?.transcription && !transcribeData?.text)) {
          throw new Error('Transcrição falhou ou retornou vazia.');
        }
        const instruction = transcribeData.transcription ?? transcribeData.text ?? '';
        log.info('voz transcrita', { len: instruction.length });

        // 2. Gera a mensagem com base na instrução transcrita.
        setState('generating');
        const recentMessages = messages.slice(-10).map((m) => ({
          content: m.content,
          sender: m.sender,
        }));

        const { data: genData, error: genError } = await invokeEdge<{
          suggestions?: Array<{ text: string }>;
        }>('ai-suggest-reply', {
          body: {
            messages: recentMessages,
            contactName,
            contactId,
            context: `INSTRUÇÃO DO VENDEDOR (ditado por voz): "${instruction}".\n\nMonte a mensagem exata para enviar ao cliente seguindo essa instrução. A mensagem DEVE ser curta, direta e no tom adequado à conversa. Retorne APENAS a mensagem pronta, sem explicações.`,
          },
        });

        if (genError || !genData?.suggestions?.length) {
          throw new Error('Geração da mensagem falhou.');
        }

        const generated = genData.suggestions[0].text ?? '';
        if (generated) {
          onResult(generated);
        }
        setState('idle');
        setErrorMessage(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        log.error('ditado por voz: falhou', { msg });
        setState('error');
        setErrorMessage(msg);
      }
    },
    [messages, contactName, contactId, onResult],
  );

  const startRecording = useCallback(async () => {
    if (!enabled) return;
    if (state !== 'idle' && state !== 'error') return;
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        void processAudio(blob);
      };

      recorder.start(200);
      setState('recording');

      timerRef.current = setInterval(() => {
        setDurationSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microfone não disponível';
      log.error('voz: falhou ao abrir microfone', { msg });
      setState('error');
      setErrorMessage('Microfone não disponível. Verifique as permissões do navegador.');
    }
  }, [enabled, state, cleanup, processAudio]);

  const stopRecording = useCallback(() => {
    if (state !== 'recording') return;
    mediaRecorderRef.current?.stop();
  }, [state]);

  return { state, errorMessage, startRecording, stopRecording, cancelRecording, durationSeconds };
}
