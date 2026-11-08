/**
 * CV-102 — Análise de imagem via AI multimodal.
 *
 * Chama `ai-multimodal-analysis` com a URL da imagem e retorna descrição,
 * texto extraído, cores, oportunidade de branding e resposta sugerida.
 */
import { useState, useCallback } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';

export interface ImageAnalysisResult {
  description: string;
  extractedText: string[];
  dominantColors: string[];
  keyElements: string[];
  brandingOpportunity: string;
  suggestedReply: string;
  confidence: number;
  isLoading: boolean;
  error: string | null;
}

export function useImageAnalysis(): ImageAnalysisResult & {
  analyze: (imageUrl: string, conversationContext?: string) => Promise<void>;
} {
  const [description, setDescription] = useState('');
  const [extractedText, setExtractedText] = useState<string[]>([]);
  const [dominantColors, setDominantColors] = useState<string[]>([]);
  const [keyElements, setKeyElements] = useState<string[]>([]);
  const [brandingOpportunity, setBrandingOpportunity] = useState('');
  const [suggestedReply, setSuggestedReply] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (imageUrl: string, conversationContext?: string) => {
    setIsLoading(true);
    setError(null);
    const { data, error: invokeError } = await invokeEdge<{
      description: string;
      extractedText: string[];
      dominantColors: string[];
      keyElements: string[];
      brandingOpportunity: string;
      suggestedReply: string;
      confidence: number;
    }>('ai-multimodal-analysis', {
      body: { imageUrl, conversationContext },
    });
    if (invokeError || !data) {
      setError(invokeError?.message ?? 'Erro ao analisar imagem');
    } else {
      setDescription(data.description);
      setExtractedText(data.extractedText ?? []);
      setDominantColors(data.dominantColors ?? []);
      setKeyElements(data.keyElements ?? []);
      setBrandingOpportunity(data.brandingOpportunity ?? '');
      setSuggestedReply(data.suggestedReply ?? '');
      setConfidence(data.confidence ?? 0);
    }
    setIsLoading(false);
  }, []);

  return { description, extractedText, dominantColors, keyElements, brandingOpportunity, suggestedReply, confidence, isLoading, error, analyze };
}
