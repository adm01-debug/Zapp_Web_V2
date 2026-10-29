import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { log } from '@/lib/logger';
import { MAX_PTT_DURATION_SEC } from '@/lib/audio/pttLimits';
import { convertAudioToMp3 } from '@/utils/audioToMp3';

interface UseAudioRecorderOptions {
  onRecordingComplete?: (audioBlob: Blob, audioUrl: string) => void;
  maxDuration?: number; // in seconds
}

// Formatos aceitos pelo MediaRecorder, do mais leve/universal (webm+opus, Chrome e
// Android) ao único que o Safari/iOS antigo grava (mp4/aac).
const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=aac',
  'audio/mp4',
] as const;

/**
 * Primeiro formato que ESTE navegador aceita gravar, perguntando ao próprio
 * MediaRecorder. Sem `isTypeSupported` (navegador antigo) ou sem nenhum formato
 * da lista, devolve `undefined` — o MediaRecorder escolhe o padrão sozinho em vez
 * de a gravação falhar por causa de um mimeType fixo.
 */
export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  for (const mime of RECORDER_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // isTypeSupported não deveria lançar; um aparelho teimoso não pode derrubar a gravação.
    }
  }
  return undefined;
}

/** Extensão coerente com o tipo do blob enviado ao bucket. */
function mimeToExtension(contentType: string): string {
  const base = contentType.split(';')[0].trim().toLowerCase();
  if (base === 'audio/mpeg') return 'mp3';
  if (base === 'audio/mp4' || base === 'audio/aac') return 'm4a';
  if (base === 'audio/ogg') return 'ogg';
  return 'webm';
}

/**
 * Traduz a falha real (permissão, microfone ausente, formato) numa mensagem que
 * diz o que fazer. Antes toda falha virava 'Não foi possível acessar o microfone'.
 */
export function describeRecorderError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permissão de microfone negada. Autorize o acesso ao microfone no navegador e tente de novo.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Nenhum microfone encontrado. Conecte um microfone e tente de novo.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'O microfone está em uso por outro aplicativo. Feche o outro aplicativo e tente de novo.';
    case 'NotSupportedError':
      return 'Este navegador não suporta a gravação de áudio no formato disponível. Atualize o navegador e tente de novo.';
    default:
      return 'Não foi possível acessar o microfone.';
  }
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  // PE-24: o padrão é o teto de PTT do WhatsApp (16 min) — antes era um 300 s solto,
  // que cortava a gravação na metade do limite real.
  const { onRecordingComplete, maxDuration = MAX_PTT_DURATION_SEC } = options;
  
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(false);
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  const maxDurationRef = useRef(maxDuration);

  useEffect(() => {
    onRecordingCompleteRef.current = onRecordingComplete;
    maxDurationRef.current = maxDuration;
  });

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
  }, []);

  const stopRecording = useCallback(() => {
    releaseCapture(true);
    setIsRecording(false);
  }, [releaseCapture]);

  const cancelRecording = useCallback(() => {
    releaseCapture(false);
    chunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
    setAudioUrl(null);
  }, [releaseCapture]);

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

      // MediaRecorder ausente = navegador sem gravação de áudio: erro de formato,
      // tratado abaixo, em vez de estourar um ReferenceError genérico.
      if (typeof MediaRecorder === 'undefined') {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const erro = new Error('MediaRecorder indisponível neste navegador');
        erro.name = 'NotSupportedError';
        throw erro;
      }

      // Formato perguntado ao navegador (Safari/iOS antigo não grava webm).
      const mimeType = pickRecorderMime();

      let mediaRecorder: MediaRecorder;
      try {
        // Sem candidato suportado, deixa o navegador escolher o padrão dele.
        mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        throw error;
      }
      
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        if (!mountedRef.current) {
          return;
        }
        // O blob declara o tipo REAL da gravação (mp4/aac no Safari), não um webm fixo.
        const audioBlob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || mimeType || 'audio/webm',
        });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        onRecordingCompleteRef.current?.(audioBlob, url);
      };
      
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);
      
      intervalRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= maxDurationRef.current) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (error) {
      log.error('Error starting recording:', error);
      toast({
        title: 'Erro ao gravar',
        description: describeRecorderError(error),
        variant: 'destructive',
      });
    }
  }, [releaseCapture, stopRecording]);

  // Desmontar no meio da gravacao (trocar de contato, fechar o composer) libera
  // microfone, recorder e timer pelo ref real — sem depender do isRecording.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseCapture(false);
    };
  }, [releaseCapture]);

  const uploadAudio = useCallback(async (blob: Blob, conversationId: string) => {
    // Formato de gravação muda por navegador (webm/opus no Chrome, mp4/aac no Safari).
    // Normaliza para MP3 antes de subir — é o único que toca em todos os aparelhos —
    // e, se a conversão não estiver disponível, sobe o próprio blob com o tipo real.
    const normalizado = await convertAudioToMp3(blob, 'gravacao');
    const uploadBlob = normalizado.ok ? normalizado.blob : blob;
    const contentType = uploadBlob.type || 'audio/webm';
    const fileName = `${conversationId}/${Date.now()}.${mimeToExtension(contentType)}`;

    const { error } = await supabase.storage
      .from('audio-messages')
      .upload(fileName, uploadBlob, {
        contentType,
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
    duration,
    audioUrl,
    startRecording,
    stopRecording,
    cancelRecording,
    uploadAudio,
    formatDuration,
  };
}
