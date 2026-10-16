/**
 * CV-101–102: useAudioAnalysis
 * Detects when a customer sends an audio message and extracts sentiment,
 * urgency cues and keywords from the transcription text (if available).
 */

export interface AudioAnalysisResult {
  duration_seconds: number;
  transcription?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  keywords: string[];
  hasUrgency: boolean;
  hasObjection: boolean;
}

/** Simplified Message shape — must be compatible with the codebase Message type. */
interface Message {
  id: string;
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker';
  content?: string;
  caption?: string;
  filename?: string;
  duration?: number;
}

const URGENCY_KEYWORDS = ['urgente', 'urgência', 'rápido', 'preciso', 'hoje', 'agora', 'imediato', 'corre'];
const OBJECTION_KEYWORDS = ['caro', 'salgado', 'não consigo', 'muito', 'desistir', 'cancelar', 'concorrente'];
const POSITIVE_KEYWORDS = ['ótimo', 'perfeito', 'adorei', 'gostei', 'fechado', 'confirmado', 'combinado', 'obrigado'];
const NEGATIVE_KEYWORDS = ['problema', 'errado', 'ruim', 'péssimo', 'insatisfeito', 'decepcionado', 'falha'];

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const all = [...URGENCY_KEYWORDS, ...OBJECTION_KEYWORDS, ...POSITIVE_KEYWORDS, ...NEGATIVE_KEYWORDS];
  return all.filter(kw => lower.includes(kw));
}

function detectSentiment(text: string): AudioAnalysisResult['sentiment'] {
  const lower = text.toLowerCase();
  const positiveHits = POSITIVE_KEYWORDS.filter(kw => lower.includes(kw)).length;
  const negativeHits = NEGATIVE_KEYWORDS.filter(kw => lower.includes(kw)).length;
  if (positiveHits > negativeHits) return 'positive';
  if (negativeHits > positiveHits) return 'negative';
  return 'neutral';
}

function analyzeAudioMessage(msg: Message): AudioAnalysisResult {
  const transcription = msg.content ?? msg.caption;
  const lower = (transcription ?? '').toLowerCase();
  return {
    duration_seconds: msg.duration ?? 0,
    transcription,
    sentiment: transcription ? detectSentiment(transcription) : 'neutral',
    keywords: transcription ? extractKeywords(transcription) : [],
    hasUrgency: URGENCY_KEYWORDS.some(kw => lower.includes(kw)),
    hasObjection: OBJECTION_KEYWORDS.some(kw => lower.includes(kw)),
  };
}

/**
 * Scans the last 5 messages for an audio message.
 * Returns the analysis of the most recent audio message, or null if none found.
 */
export function useAudioAnalysis(messages: Message[]): AudioAnalysisResult | null {
  const recent = messages.slice(-5);
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (msg.type === 'audio') {
      return analyzeAudioMessage(msg);
    }
  }
  return null;
}
