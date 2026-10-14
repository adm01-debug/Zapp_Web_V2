export interface VoiceAgentAction {
  action: "search" | "filter" | "navigate" | "sort" | "clear" | "answer";
  response: string;
  data?: {
    query?: string;
    route?: string;
    sortBy?: string;
    filters?: {
      sentiment?: string;
      assigned?: boolean;
      unread?: boolean;
      contactType?: string;
      category?: string;
      status?: string;
    };
  };
}

export type VoiceAgentPhase = "idle" | "booting" | "listening" | "processing" | "speaking" | "error";

/**
 * Estado da fala da resposta: vazio quando nada falhou, `autoplay-blocked` quando o
 * navegador recusou o `play()` (Safari/iOS) e `playback-failed` quando o TTS não pôde
 * ser tocado. O texto em pt-BR e o rótulo da ação ficam na tela (componente), não aqui.
 */
export type VoiceTtsIssue = '' | 'autoplay-blocked' | 'playback-failed';

export interface UseVoiceAgentOptions {
  onAction?: (action: VoiceAgentAction) => void;
  onError?: (error: string) => void;
}

export interface UseVoiceAgentReturn {
  phase: VoiceAgentPhase;
  partialTranscript: string;
  finalTranscript: string;
  agentResponse: string;
  error: string;
  ttsIssue: VoiceTtsIssue;
  startListening: () => Promise<void>;
  stopListening: () => void;
  stopSpeaking: () => void;
  replayResponse: () => Promise<void>;
  reset: () => void;
}
