/**
 * useKnowledgeBaseSearch
 * 
 * Calls search_knowledge_base RPC for agent quick-search during conversations.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useCallback, useRef, useEffect } from 'react';

export interface KBArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  rank: number;
}

export function useKnowledgeBaseSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const { data: articles, isLoading } = useQuery({
    queryKey: ['knowledge-base-search', debouncedQuery],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_knowledge_base', {
        search_query: debouncedQuery,
        max_results: 5,
      });
      if (error) throw error;
      return (data ?? []) as KBArticle[];
    },
    enabled: debouncedQuery.length >= 2,
  });

  const clear = useCallback(() => {
    // Cancela o debounce que ainda não disparou: sem isso o temporizador antigo
    // repõe em `debouncedQuery` o termo que o usuário acabou de apagar (#484).
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = undefined;
    setQuery('');
    setDebouncedQuery('');
  }, []);

  return {
    query,
    handleSearch,
    clear,
    articles: articles ?? [],
    isLoading,
    hasResults: (articles?.length ?? 0) > 0,
  };
}
