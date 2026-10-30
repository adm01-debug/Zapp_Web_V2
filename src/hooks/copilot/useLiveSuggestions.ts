/**
 * CV-041/045 — Sugestões ao vivo do RADAR e o que mais o motor grava por tick.
 *
 * Lê `copilot_insights` da sessão: as sugestões (`insight_type = 'suggestion'`,
 * `data.path` avancar/descobrir/relacionar) da rodada mais recente
 * (`state_version` máximo), o próximo passo e os alertas. Assina o Realtime de
 * `copilot_insights` filtrado pela sessão; a cada insight novo relê e avisa
 * `onNewInsight` (a sessão não está no Realtime, então é por aqui que ela se atualiza).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SuggestionPath = 'avancar' | 'descobrir' | 'relacionar';

export interface LiveSuggestion {
  id: string;
  path: SuggestionPath;
  text: string;
  play_name?: string;
  sources: Array<{ text: string; letter?: string; msg_id?: string }>;
  split_messages?: string[];
  created_at: string;
}

interface InsightRow {
  id: string;
  insight_type: string;
  content: string;
  data: unknown;
  state_version: number;
  created_at: string;
}

const PATHS: readonly SuggestionPath[] = ['avancar', 'descobrir', 'relacionar'];

/** Separa a rodada mais recente em sugestões, próximo passo e alertas. Exportado para teste. */
export function splitInsights(rows: InsightRow[]): { suggestions: LiveSuggestion[]; nextStep: string | null; alerts: string[] } {
  const ultima = rows.reduce((max, r) => Math.max(max, r.state_version), 0);
  const daRodada = rows.filter((r) => r.state_version === ultima);
  const suggestions = daRodada
    .filter((r) => r.insight_type === 'suggestion')
    .map((r): LiveSuggestion => {
      const d = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
      return {
        id: r.id,
        path: PATHS.includes(d.path as SuggestionPath) ? (d.path as SuggestionPath) : 'avancar',
        text: r.content,
        play_name: typeof d.play_name === 'string' ? d.play_name : undefined,
        sources: Array.isArray(d.sources) ? (d.sources as LiveSuggestion['sources']) : [],
        split_messages: Array.isArray(d.split_messages) ? (d.split_messages as string[]) : undefined,
        created_at: r.created_at,
      };
    })
    .sort((a, b) => PATHS.indexOf(a.path) - PATHS.indexOf(b.path))
    .slice(0, 3);
  const nextStep = daRodada.find((r) => r.insight_type === 'next_action')?.content ?? null;
  const alerts = daRodada.filter((r) => r.insight_type === 'alert').map((r) => r.content);
  return { suggestions, nextStep, alerts };
}

export interface UseLiveSuggestionsResult {
  suggestions: LiveSuggestion[];
  nextStep: string | null;
  alerts: string[];
  loading: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
  refresh: () => void;
}

const VAZIO: ReturnType<typeof splitInsights> = { suggestions: [], nextStep: null, alerts: [] };

/** Janela lida: as últimas rodadas bastam para achar a mais recente. */
const LIMITE = 30;

export function useLiveSuggestions(sessionId: string | null, onNewInsight?: () => void): UseLiveSuggestionsResult {
  const [versao, setVersao] = useState(0);
  const [lido, setLido] = useState<{
    chave: string;
    sessionId: string;
    estado: ReturnType<typeof splitInsights>;
    error: string | null;
    lastUpdatedAt: string | null;
  } | null>(null);
  const chave = sessionId ? `${sessionId}:${versao}` : null;
  const avisar = useRef(onNewInsight);
  useEffect(() => {
    avisar.current = onNewInsight;
  }, [onNewInsight]);

  const refresh = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    if (!sessionId || !chave) return;
    let cancelado = false;
    void (async () => {
      const { data, error: dbError } = await supabase
        .from('copilot_insights')
        .select('id, insight_type, content, data, state_version, created_at')
        .eq('session_id', sessionId)
        .in('insight_type', ['suggestion', 'next_action', 'alert'])
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(LIMITE);
      if (cancelado) return;
      if (dbError) {
        setLido({ chave, sessionId, estado: VAZIO, error: 'Não foi possível carregar as sugestões do RADAR.', lastUpdatedAt: null });
        return;
      }
      const rows = (data ?? []) as unknown as InsightRow[];
      setLido({ chave, sessionId, estado: splitInsights(rows), error: null, lastUpdatedAt: rows[0]?.created_at ?? null });
    })();
    return () => {
      cancelado = true;
    };
  }, [sessionId, chave]);

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`copilot_insights:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'copilot_insights', filter: `session_id=eq.${sessionId}` },
        () => {
          refresh();
          avisar.current?.();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, refresh]);

  const atual = sessionId && lido?.sessionId === sessionId ? lido : null;
  return {
    ...(atual?.estado ?? VAZIO),
    loading: chave !== null && lido?.chave !== chave,
    error: atual?.error ?? null,
    lastUpdatedAt: atual?.lastUpdatedAt ?? null,
    refresh,
  };
}
