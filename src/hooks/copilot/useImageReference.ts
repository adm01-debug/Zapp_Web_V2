import { useState, useCallback } from 'react';
import type { ProductRecommendation } from './useProductRecommendation';

export interface UseImageReferenceOptions {
  maxResults?: number;
}

export interface ImageReferenceState {
  description: string | null;
  suggestions: ProductRecommendation[];
  isSearching: boolean;
  error: string | null;
}

/**
 * CV-103 — DELEGADA a IA-136.
 * Client sends a reference image ("quero algo assim") → RADAR describes it and searches the catalog.
 */
export function useImageReference(options: UseImageReferenceOptions = {}) {
  const { maxResults = 3 } = options;
  const [state, setState] = useState<ImageReferenceState>({
    description: null,
    suggestions: [],
    isSearching: false,
    error: null,
  });

  const search = useCallback(async (imageUrl: string) => {
    setState(s => ({ ...s, isSearching: true, error: null }));
    try {
      const resp = await fetch('/api/ai-image-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl, max_results: maxResults }),
      });
      if (!resp.ok) throw new Error(`image search error ${resp.status}`);
      const data = await resp.json();
      setState({
        description: data.description ?? null,
        suggestions: data.suggestions ?? [],
        isSearching: false,
        error: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro na busca por imagem';
      setState({ description: null, suggestions: [], isSearching: false, error: msg });
    }
  }, [maxResults]);

  const reset = useCallback(() => {
    setState({ description: null, suggestions: [], isSearching: false, error: null });
  }, []);

  return { ...state, search, reset };
}
