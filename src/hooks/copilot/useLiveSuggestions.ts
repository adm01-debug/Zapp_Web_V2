/**
 * CV-041 / CV-045 — Hook de sugestões ao vivo do copilot RADAR.
 * Busca e subscreve insights do tipo 'suggestion' em tempo real.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveSuggestion {
  id: string;
  path: 'avancar' | 'descobrir' | 'relacionar';
  text: string;
  play_name?: string;
  sources: Array<{ text: string; letter?: string; msg_id?: string }>;
  split_messages?: string[];
  created_at: string;
}

interface UseLiveSuggestionsResult {
  suggestions: LiveSuggestion[];
  loading: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
  refresh: () => void;
}

export function useLiveSuggestions(sessionId: string | null): UseLiveSuggestionsResult {
  const [suggestions, setSuggestions] = useState<LiveSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const refreshRef = useRef(0);

  const fetchSuggestions = async () => {
    if (!sessionId) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('copilot_insights')
        .select('id, data, created_at')
        .eq('session_id', sessionId)
        .eq('insight_type', 'suggestion')
        .order('created_at', { ascending: false })
        .limit(3);

      if (dbError) throw dbError;

      const parsed: LiveSuggestion[] = (data ?? []).map((row) => {
        const d = row.data as Record<string, unknown>;
        return {
          id: row.id as string,
          path: (d.path as LiveSuggestion['path']) ?? 'avancar',
          text: (d.text as string) ?? '',
          play_name: d.play_name as string | undefined,
          sources: (d.sources as LiveSuggestion['sources']) ?? [],
          split_messages: d.split_messages as string[] | undefined,
          created_at: row.created_at as string,
        };
      });

      setSuggestions(parsed);
      setLastUpdatedAt(parsed[0]?.created_at ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar sugestões');
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => {
    refreshRef.current += 1;
  };

  useEffect(() => {
    fetchSuggestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, refreshRef.current]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`copilot_insights:suggestions:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'copilot_insights',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as { insight_type: string; id: string; data: unknown; created_at: string };
          if (row.insight_type !== 'suggestion') return;
          const d = row.data as Record<string, unknown>;
          const newSuggestion: LiveSuggestion = {
            id: row.id,
            path: (d.path as LiveSuggestion['path']) ?? 'avancar',
            text: (d.text as string) ?? '',
            play_name: d.play_name as string | undefined,
            sources: (d.sources as LiveSuggestion['sources']) ?? [],
            split_messages: d.split_messages as string[] | undefined,
            created_at: row.created_at,
          };
          setSuggestions((prev) => [newSuggestion, ...prev].slice(0, 3));
          setLastUpdatedAt(row.created_at);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { suggestions, loading, error, lastUpdatedAt, refresh };
}
