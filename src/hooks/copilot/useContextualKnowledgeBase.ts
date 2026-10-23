import { useState, useCallback } from 'react';

export interface KnowledgeEntry {
  entryId: string;
  title: string;
  content: string;
  productCategory: string;
  segment: string;
  tags: string[];
  relevanceScore: number;
  lastUpdated: string;
}

export interface UseContextualKnowledgeBaseOptions {
  productCategory?: string;
  segment?: string;
}

export interface ContextualKnowledgeBaseState {
  entries: KnowledgeEntry[];
  isFetching: boolean;
  error: string | null;
  search: (query: string, context?: { productCategory?: string; segment?: string }) => Promise<void>;
}

/**
 * CV-134 — Base de conhecimento contextual por produto/segmento.
 * GET /api/radar-knowledge?query=...&product_category=...&segment=...
 */
export function useContextualKnowledgeBase({
  productCategory,
  segment,
}: UseContextualKnowledgeBaseOptions = {}): ContextualKnowledgeBaseState {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (
    query: string,
    context?: { productCategory?: string; segment?: string },
  ) => {
    setIsFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ query });
      const cat = context?.productCategory ?? productCategory;
      const seg = context?.segment ?? segment;
      if (cat) params.set('product_category', cat);
      if (seg) params.set('segment', seg);
      const res = await fetch(`/api/radar-knowledge?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: KnowledgeEntry[] = await res.json();
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar conhecimento');
    } finally {
      setIsFetching(false);
    }
  }, [productCategory, segment]);

  return { entries, isFetching, error, search };
}
