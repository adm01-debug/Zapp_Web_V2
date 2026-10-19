import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { getLogger } from '@/lib/logger';
import type { Achievement, AgentStats } from './types';

/**
 * Refazer de c26046478 (t_8e0d9185): a entrega original assinava
 * `agent_achievements` no Realtime e quebrava o ESPELHO DO CI
 * ("no unresolved or dead Realtime subscriptions"), porque essa tabela não
 * está na publicação `supabase_realtime`. Aqui a única assinatura é
 * `agent_stats` (publicada); a conquista chega pelo aumento de
 * `achievements_count`, gravado na mesma transação do insert no servidor.
 */

const log = getLogger('AgentCelebrations');

/** Tópico exclusivo por instância: dois consumidores ao vivo não dividem canal. */
const CANAL_BASE = 'agente-celebracoes';
/** Janela olhada ao ressincronizar: só o que ainda pode virar festa na tela. */
const JANELA_CONQUISTAS = 20;

export interface AchievementCelebration {
  kind: 'achievement';
  /** Chave estável de deduplicação (id da conquista). */
  key: string;
  id: string;
  achievementType: string;
  name: string;
  description: string | null;
  xpEarned: number;
  earnedAt: string;
}

export interface LevelCelebration {
  kind: 'level_up';
  key: string;
  level: number;
  previousLevel: number;
  xp: number | null;
}

export type AgentCelebration = AchievementCelebration | LevelCelebration;

export interface UseAgentCelebrationsOptions {
  /** Perfil a observar. Sem ele, o hook resolve o perfil do próprio usuário logado. */
  profileId?: string | null;
  enabled?: boolean;
  /** Disparado a cada evento novo (o mesmo evento nunca dispara duas vezes). */
  onCelebration?: (celebration: AgentCelebration) => void;
}

export interface UseAgentCelebrationsResult {
  /** Fila cronológica do que chegou e ainda não foi mostrado. */
  celebrations: AgentCelebration[];
  /** Fecha uma celebração pela chave; sem chave, fecha a primeira da fila. */
  dismiss: (key?: string) => void;
  clear: () => void;
}

export function useAgentCelebrations(
  options: UseAgentCelebrationsOptions = {},
): UseAgentCelebrationsResult {
  const { user } = useAuth();
  const enabled = options.enabled ?? true;
  const profileIdExplicito = options.profileId ?? null;

  // Mesmo cache do `useAgentGamification`: sem perfil, resolve o próprio.
  const perfilQuery = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string } | null;
    },
    enabled: enabled && !!user?.id && !profileIdExplicito,
  });

  const profileId = profileIdExplicito ?? perfilQuery.data?.id ?? null;

  // Fila etiquetada pelo perfil: trocar de perfil não mistura celebrações antigas
  // com as novas (e nada é limpo dentro de um efeito).
  const [fila, setFila] = useState<{ perfil: string | null; itens: AgentCelebration[] }>({
    perfil: null,
    itens: [],
  });

  // Ids de conquista já contabilizados (semeados no baseline OU celebrados).
  const conquistasConhecidas = useRef<Set<string>>(new Set());
  // Nível conhecido do perfil: só aumento vira celebração.
  const nivelConhecido = useRef<number | null>(null);
  // Contagem de conquistas conhecida: aumento sinaliza que nova conquista chegou.
  const achievementsCountConhecido = useRef<number | null>(null);
  // Último estado de conexão do canal, para detectar a reconexão.
  const estadoCanal = useRef<string | null>(null);

  const onCelebrationRef = useRef(options.onCelebration);
  useEffect(() => {
    onCelebrationRef.current = options.onCelebration;
  }, [options.onCelebration]);

  const celebrarConquista = useCallback((linha: Partial<Achievement> | null | undefined) => {
    const id = linha?.id ? String(linha.id) : null;
    if (!id || conquistasConhecidas.current.has(id)) return;
    conquistasConhecidas.current.add(id);
    const evento: AchievementCelebration = {
      kind: 'achievement',
      key: `achievement:${id}`,
      id,
      achievementType: String(linha?.achievement_type ?? ''),
      name: String(linha?.achievement_name ?? ''),
      description: linha?.achievement_description ?? null,
      xpEarned: Number(linha?.xp_earned ?? 0),
      earnedAt: String(linha?.earned_at ?? ''),
    };
    setFila((atual) =>
      atual.perfil === profileId
        ? { perfil: profileId, itens: [...atual.itens, evento] }
        : { perfil: profileId, itens: [evento] },
    );
    onCelebrationRef.current?.(evento);
  }, [profileId]);

  const celebrarNivel = useCallback((nivel: unknown, xp: unknown) => {
    const novo = Number(nivel);
    if (!Number.isFinite(novo)) return;
    // Sem linha de stats ainda: o primeiro nível é o ponto de partida, não uma festa.
    if (nivelConhecido.current === null) {
      nivelConhecido.current = novo;
      return;
    }
    if (novo <= nivelConhecido.current) {
      nivelConhecido.current = Math.max(nivelConhecido.current, novo);
      return;
    }
    const anterior = nivelConhecido.current;
    nivelConhecido.current = novo;
    const evento: LevelCelebration = {
      kind: 'level_up',
      key: `level_up:${novo}`,
      level: novo,
      previousLevel: anterior,
      xp: xp === null || xp === undefined ? null : Number(xp),
    };
    setFila((atual) =>
      atual.perfil === profileId
        ? { perfil: profileId, itens: [...atual.itens, evento] }
        : { perfil: profileId, itens: [evento] },
    );
    onCelebrationRef.current?.(evento);
  }, [profileId]);

  // Baseline: conquistas anteriores ao mount são semeadas (não viram festa); as que
  // chegaram com earned_at >= montouEm são uma "corrida" — celebradas de imediato.
  useEffect(() => {
    if (!enabled || !profileId) return;
    let vivo = true;
    conquistasConhecidas.current = new Set();
    nivelConhecido.current = null;
    achievementsCountConhecido.current = null;
    const montouEm = Date.now();

    void (async () => {
      const [conquistas, stats] = await Promise.all([
        supabase
          .from('agent_achievements')
          .select('*')
          .eq('profile_id', profileId)
          .order('earned_at', { ascending: false })
          .limit(JANELA_CONQUISTAS),
        supabase.from('agent_stats').select('*').eq('profile_id', profileId).maybeSingle(),
      ]);
      if (!vivo) return;
      if (conquistas.error) log.warn('Falha ao carregar conquistas do perfil', conquistas.error);
      for (const linha of (conquistas.data ?? []) as Achievement[]) {
        if (!linha?.id) continue;
        const earnedAt = linha.earned_at ? new Date(String(linha.earned_at)).getTime() : 0;
        if (earnedAt >= montouEm) {
          celebrarConquista(linha);
        } else {
          conquistasConhecidas.current.add(String(linha.id));
        }
      }
      if (stats.error) log.warn('Falha ao carregar stats do perfil', stats.error);
      const statsLinha = stats.data as AgentStats | null;
      if (statsLinha) {
        nivelConhecido.current = Number(statsLinha.level);
        achievementsCountConhecido.current = Number(statsLinha.achievements_count ?? 0);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [enabled, profileId, celebrarConquista]);

  // Ressincronização: o que chegou durante a queda volta pelo banco — e o que já
  // foi celebrado cai no mesmo filtro de ids, então não repete.
  const ressincronizar = useCallback(
    async (id: string) => {
      try {
        const [conquistas, stats] = await Promise.all([
          supabase
            .from('agent_achievements')
            .select('*')
            .eq('profile_id', id)
            .order('earned_at', { ascending: false })
            .limit(JANELA_CONQUISTAS),
          supabase.from('agent_stats').select('*').eq('profile_id', id).maybeSingle(),
        ]);
        if (conquistas.error) log.warn('Falha ao ressincronizar conquistas', conquistas.error);
        for (const linha of (conquistas.data ?? []) as Achievement[]) celebrarConquista(linha);
        if (stats.error) log.warn('Falha ao ressincronizar stats', stats.error);
        const statsLinha = stats.data as AgentStats | null;
        if (statsLinha) celebrarNivel(statsLinha.level, statsLinha.xp);
      } catch (erro) {
        log.warn('Ressincronização de celebrações falhou', erro);
      }
    },
    [celebrarConquista, celebrarNivel],
  );

  useEffect(() => {
    if (!enabled || !profileId) return;
    estadoCanal.current = null;

    const canal = supabase
      .channel(uniqueRealtimeTopic(CANAL_BASE))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_stats',
          filter: `profile_id=eq.${profileId}`,
        },
        (payload) => {
          const linha = payload.new as unknown as AgentStats | null;
          if (linha) {
            celebrarNivel(linha.level, linha.xp);
            const novoCount = Number(linha.achievements_count ?? 0);
            const countAnterior = achievementsCountConhecido.current;
            achievementsCountConhecido.current = Math.max(novoCount, countAnterior ?? 0);
            if (countAnterior !== null && novoCount > countAnterior) {
              void ressincronizar(profileId);
            }
          }
        },
      )
      .subscribe((status) => {
        const anterior = estadoCanal.current;
        estadoCanal.current = status;
        // Só a volta de uma conexão perdida ressincroniza; o primeiro SUBSCRIBED
        // já foi coberto pelo baseline.
        if (status === 'SUBSCRIBED' && anterior !== null && anterior !== 'SUBSCRIBED') {
          void ressincronizar(profileId);
        }
      });

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [enabled, profileId, celebrarConquista, celebrarNivel, ressincronizar]);

  const celebrations = fila.perfil === profileId ? fila.itens : [];

  const dismiss = useCallback((key?: string) => {
    setFila((atual) => ({
      ...atual,
      itens: key ? atual.itens.filter((c) => c.key !== key) : atual.itens.slice(1),
    }));
  }, []);

  const clear = useCallback(() => setFila((atual) => ({ ...atual, itens: [] })), []);

  return { celebrations, dismiss, clear };
}
