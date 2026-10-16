import { useState, useCallback, useRef, useEffect } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('SpeechToText');

interface UseSpeechToTextOptions {
  language?: string;
  continuous?: boolean;
  onResult?: (text: string) => void;
  onEnd?: () => void;
}

/** Códigos de erro do Web Speech API já traduzidos para o vocabulário do app. */
export type SpeechErrorCode = 'permission' | 'no-speech' | 'network' | 'device' | 'unknown';

const SPEECH_ERROR_CODES: Record<string, SpeechErrorCode> = {
  'not-allowed': 'permission',
  'service-not-allowed': 'permission',
  'audio-capture': 'device',
  'no-speech': 'no-speech',
  network: 'network',
};

/** Traduz o `event.error` do navegador para um código conhecido (desconhecido vira `unknown`). */
export function mapSpeechErrorCode(rawCode: string): SpeechErrorCode {
  return SPEECH_ERROR_CODES[rawCode] ?? 'unknown';
}

interface SpeechToTextReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  /** Último erro da sessão vigente (permissão negada, sem microfone, sem fala, rede). */
  error: SpeechErrorCode | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  clearError: () => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionResultEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}): SpeechToTextReturn {
  const { language = 'pt-BR', continuous = true, onResult, onEnd } = options;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<SpeechErrorCode | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  const Ctor = getSpeechRecognition();
  const isSupported = !!Ctor;

  const startListening = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = language;
    recognition.continuous = continuous;
    recognition.interimResults = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const combined = finalTranscript || interimTranscript;
      setTranscript(combined);

      if (finalTranscript && onResultRef.current) {
        onResultRef.current(finalTranscript);
      }
    };

    // Encerramento de sessão anterior (onend/onerror) não pode apagar o indicador
    // da sessão vigente: se o ref já aponta para outro reconhecimento, este é velho.
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      setIsListening(false);
      onEndRef.current?.();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (recognitionRef.current !== recognition) return;
      log.warn('Speech recognition error:', event.error);
      // A falha precisa chegar ao operador (permissão negada, sem microfone, sem fala, rede):
      // só o `log.warn` deixava o botão parar de escutar sem nenhuma explicação.
      setError(mapSpeechErrorCode(String(event.error)));
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript('');
    // Nova sessão: o aviso da anterior não vale mais; o próximo erro é que avisa.
    setError(null);

    if (navigator.vibrate) navigator.vibrate(15);
  }, [language, continuous]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    error,
    startListening,
    stopListening,
    toggleListening,
    clearError,
  };
}
