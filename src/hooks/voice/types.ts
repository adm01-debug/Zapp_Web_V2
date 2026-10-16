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
  startListening: () => Promise<void>;
  stopListening: () => void;
  stopSpeaking: () => void;
  reset: () => void;
}
