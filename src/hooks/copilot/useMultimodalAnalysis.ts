/**
 * CV-101 to CV-110 — Phase 11: Multimodal Analysis
 *
 * CV-101: Audio transcription — transcribe voice messages from contact.
 * CV-102: Audio sentiment — tone/emotion from voice.
 * CV-103: Image understanding — describe what's in shared images.
 * CV-104: Logo detection — detect competitor logos in images.
 * CV-105: Handwriting OCR — extract text from handwritten notes.
 * CV-106: PDF catalog reader — extract products/prices from PDF.
 * CV-107: Competitor print analysis — extract info from competitor brochures.
 * CV-108: Label/packaging reader — decode product details from photos.
 * CV-109: Chart/table extractor — extract data from screenshots of spreadsheets.
 * CV-110: Multimodal context — inject extracted content into conversation context.
 */
import { useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';
import { createLogger } from '@/lib/logger';

const log = createLogger('useMultimodalAnalysis');

export type AnalysisType =
  | 'audio_transcription'
  | 'audio_sentiment'
  | 'image_description'
  | 'logo_detection'
  | 'ocr'
  | 'pdf_catalog'
  | 'competitor_print'
  | 'label_reader'
  | 'chart_extractor';

export interface MultimodalResult {
  type: AnalysisType;
  text: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface MultimodalAnalysisState {
  results: MultimodalResult[];
  competitorLogoDetected: boolean;
  competitorName: string;
  contextSnippet: string;
  loading: boolean;
}

export interface UseMultimodalAnalysisOptions {
  conversationId: string;
  contactId: string;
  enabled?: boolean;
}

export interface MultimodalAnalysisActions {
  state: MultimodalAnalysisState;
  analyzeMedia: (mediaUrl: string, mediaType: string, analysisHint?: AnalysisType) => void;
  clear: () => void;
}

const EMPTY_STATE: MultimodalAnalysisState = {
  results: [],
  competitorLogoDetected: false,
  competitorName: '',
  contextSnippet: '',
  loading: false,
};

export function useMultimodalAnalysis({
  conversationId,
  contactId,
  enabled = true,
}: UseMultimodalAnalysisOptions): MultimodalAnalysisActions {
  const [state, setState] = useState<MultimodalAnalysisState>(EMPTY_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => setState(EMPTY_STATE), []);

  const analyzeMedia = useCallback(
    (mediaUrl: string, mediaType: string, analysisHint?: AnalysisType) => {
      if (!enabled || !mediaUrl) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setState((s) => ({ ...s, loading: true }));

      void (async () => {
        try {
          const { data, error } = await invokeEdge<{
            results?: MultimodalResult[];
            competitorLogoDetected?: boolean;
            competitorName?: string;
            contextSnippet?: string;
          }>('ai-multimodal-analysis', {
            body: {
              conversationId,
              contactId,
              mediaUrl,
              mediaType,
              analysisHint,
            },
          });

          if (error || !data) {
            log.warn('ai-multimodal-analysis falhou', { msg: error ?? 'sem dados' });
            setState((s) => ({ ...s, loading: false }));
            return;
          }

          if (data.competitorLogoDetected) {
            log.info('logo de concorrente detectado', { name: data.competitorName });
          }

          setState((s) => ({
            results: [...s.results, ...(data.results ?? [])],
            competitorLogoDetected: data.competitorLogoDetected ?? false,
            competitorName: data.competitorName ?? '',
            contextSnippet: data.contextSnippet ?? '',
            loading: false,
          }));
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            log.warn('useMultimodalAnalysis: erro', { msg: err.message });
          }
          setState((s) => ({ ...s, loading: false }));
        }
      })();
    },
    [enabled, conversationId, contactId],
  );

  return { state, analyzeMedia, clear };
}
