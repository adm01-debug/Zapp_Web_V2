import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { log } from '@/lib/logger';

interface UseAudioRecorderOptions {
  onRecordingComplete?: (audioBlob: Blob, audioUrl: string) => void;
  maxDuration?: number; // in seconds
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const { onRecordingComplete, maxDuration = 300 } = options;
  
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
        description: 'Não foi possível acessar o microfone.',
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
    duration,
    audioUrl,
    startRecording,
    stopRecording,
    cancelRecording,
    uploadAudio,
    formatDuration,
  };
}
