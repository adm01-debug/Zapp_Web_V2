import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { log } from '@/lib/logger';
import { MAX_PTT_DURATION_SEC } from '@/lib/audio/pttLimits';
import {
  escolherMimeGravacao,
  formatoDeUpload,
  mensagemErroGravacao,
  mimeBase,
} from '@/lib/audio/gravacaoFormato';

interface UseAudioRecorderOptions {
  onRecordingComplete?: (audioBlob: Blob, audioUrl: string) => void;
  maxDuration?: number; // in seconds
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
  // G9: mime REAL com que esta captura está gravando (decidido na montagem do
  // MediaRecorder). Rotula o blob emitido; `null` quando o navegador não
  // informou formato nenhum.
  const mimeGravacaoRef = useRef<string | null>(null);
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
      
      // G9: escolhe o mime que ESTE navegador sabe gravar (webm/opus, mp4, ogg).
      // Sem nenhum suportado, cria o recorder sem mimeType (padrão do navegador)
      // e lê o formato real de `recorder.mimeType` logo abaixo.
      const mimeEscolhido = escolherMimeGravacao();

      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(
          stream,
          mimeEscolhido ? { mimeType: mimeEscolhido } : undefined,
        );
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        throw error;
      }

      // O mime que rotula o blob sai do recorder REAL. Se nem a lista nem o
      // navegador informarem formato, avisa em pt-BR em vez de gravar um áudio
      // rotulado como webm que pode não tocar.
      const mimeReal = mimeBase(mediaRecorder.mimeType || mimeEscolhido || '');
      mimeGravacaoRef.current = mimeReal || null;
      if (!mimeReal) {
        toast({
          title: 'Formato de áudio não suportado',
          description: 'Este navegador não informou um formato de gravação compatível; o áudio pode não ser enviado corretamente.',
          variant: 'destructive',
        });
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
        const audioBlob = new Blob(chunksRef.current, {
          type: mimeGravacaoRef.current ?? 'audio/webm',
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
        description: mensagemErroGravacao(error),
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
    // G9: extensão e Content-Type saem do mime REAL do blob (mp4/m4a no Safari),
    // em vez do webm fixo que rotulava mal o objeto.
    const { contentType, extensao } = formatoDeUpload(blob.type);
    const fileName = `${conversationId}/${Date.now()}.${extensao}`;
    
    const { error } = await supabase.storage
      .from('audio-messages')
      .upload(fileName, blob, {
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
