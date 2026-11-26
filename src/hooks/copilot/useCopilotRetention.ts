import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

/** Agregado diario do copiloto RADAR (CV-143). */
export const TABELA_RETENCAO = 'copilot_retention_aggregates';
export const QUERY_KEY_RETENCAO = 'copilot-retencao';
export const DIAS_PADRAO = 14;
/** Janelas oferecidas na tela; a RPC de recalculo aceita de 1 a 90 dias. */
export const JANELAS_DIAS = [7, 14, 30] as const;
export type JanelaDias = (typeof JANELAS_DIAS)[number];

const COLUNAS =
  'profile_id, agg_date, sessions_opened, ticks_processed, insights_gen, brinde_complete, avg_temperature';

interface LinhaAgregado {
  profile_id: string;
  agg_date: string;
  sessions_opened: number;
  ticks_processed: number;
  insights_gen: number;
  brinde_complete: number;
  avg_temperature: number | string | null;
}

interface LinhaPerfil {
  user_id: string;
  name: string | null;
}

/** Uma linha do agregado ja traduzida para a tela. */
export interface RetencaoLinha {
  profileId: string;
  atendente: string;
  /** Dia do agregado, `AAAA-MM-DD`. */
  dia: string;
  sessoes: number;
  ticks: number;
  insights: number;
  brindes: number;
  /** Media de temperatura das sessoes do dia; `null` quando o dia nao tem sessoes. */
  temperaturaMedia: number | null;
}

export interface RetencaoPorAtendente {
  profileId: string;
  atendente: string;
  sessoes: number;
  ticks: number;
  insights: number;
  brindes: number;
  temperaturaMedia: number | null;
  diasComDados: number;
}

export interface RetencaoPorDia {
  dia: string;
  sessoes: number;
  ticks: number;
  insights: number;
  atendentes: number;
}

export interface RetencaoResumo {
  atendentes: number;
  sessoes: number;
  ticks: number;
  insights: number;
  brindes: number;
  temperaturaMedia: number | null;
  diasComDados: number;
}

/** Dia `AAAA-MM-DD` de `dias` atras, no fuso local (PostgREST compara com `date`). */
export function diaLimite(dias: number, agora: Date = new Date()): string {
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  d.setDate(d.getDate() - Math.max(1, dias) + 1);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function numero(valor: number | string | null | undefined): number {
  const n = typeof valor === 'string' ? Number(valor) : (valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function mapLinha(linha: LinhaAgregado, nomes: Map<string, string>): RetencaoLinha {
  const temperatura = linha.avg_temperature === null ? null : numero(linha.avg_temperature);
  return {
    profileId: linha.profile_id,
    atendente: nomes.get(linha.profile_id) ?? 'Atendente sem nome',
    dia: linha.agg_date,
    sessoes: numero(linha.sessions_opened),
    ticks: numero(linha.ticks_processed),
    insights: numero(linha.insights_gen),
    brindes: numero(linha.brinde_complete),
    temperaturaMedia: temperatura,
  };
}

/**
 * Media de temperatura ponderada pelas sessoes do dia: um dia com 2 sessoes nao
 * pode pesar o mesmo que um com 200. Dias sem leitura entram como zero de peso.
 */
function mediaTemperatura(linhas: RetencaoLinha[]): number | null {
  let soma = 0;
  let peso = 0;
  for (const l of linhas) {
    if (l.temperaturaMedia === null || l.sessoes <= 0) continue;
    soma += l.temperaturaMedia * l.sessoes;
    peso += l.sessoes;
  }
  return peso > 0 ? soma / peso : null;
}

export function resumirRetencao(linhas: RetencaoLinha[]): RetencaoResumo {
  const atendentes = new Set<string>();
  const dias = new Set<string>();
  let sessoes = 0;
  let ticks = 0;
  let insights = 0;
  let brindes = 0;
  for (const l of linhas) {
    atendentes.add(l.profileId);
    dias.add(l.dia);
    sessoes += l.sessoes;
    ticks += l.ticks;
    insights += l.insights;
    brindes += l.brindes;
  }
  return {
    atendentes: atendentes.size,
    sessoes,
    ticks,
    insights,
    brindes,
    temperaturaMedia: mediaTemperatura(linhas),
    diasComDados: dias.size,
  };
}

/** Soma por atendente, do mais ativo para o menos ativo. */
export function agruparPorAtendente(linhas: RetencaoLinha[]): RetencaoPorAtendente[] {
  const mapa = new Map<string, { nome: string; linhas: RetencaoLinha[]; dias: Set<string> }>();
  for (const l of linhas) {
    const atual = mapa.get(l.profileId);
    if (atual) {
      atual.linhas.push(l);
      atual.dias.add(l.dia);
    } else {
      mapa.set(l.profileId, { nome: l.atendente, linhas: [l], dias: new Set([l.dia]) });
    }
  }
  return [...mapa.entries()]
    .map(([profileId, dados]) => ({
      profileId,
      atendente: dados.nome,
      sessoes: dados.linhas.reduce((s, l) => s + l.sessoes, 0),
      ticks: dados.linhas.reduce((s, l) => s + l.ticks, 0),
      insights: dados.linhas.reduce((s, l) => s + l.insights, 0),
      brindes: dados.linhas.reduce((s, l) => s + l.brindes, 0),
      temperaturaMedia: mediaTemperatura(dados.linhas),
      diasComDados: dados.dias.size,
    }))
    .sort((a, b) => b.sessoes - a.sessoes || a.atendente.localeCompare(b.atendente, 'pt-BR'));
}

/** Soma por dia, do mais recente para o mais antigo. */
export function agruparPorDia(linhas: RetencaoLinha[]): RetencaoPorDia[] {
  const mapa = new Map<string, RetencaoPorDia & { perfis: Set<string> }>();
  for (const l of linhas) {
    const atual = mapa.get(l.dia);
    if (atual) {
      atual.sessoes += l.sessoes;
      atual.ticks += l.ticks;
      atual.insights += l.insights;
      atual.perfis.add(l.profileId);
    } else {
      mapa.set(l.dia, {
        dia: l.dia,
        sessoes: l.sessoes,
        ticks: l.ticks,
        insights: l.insights,
        atendentes: 0,
        perfis: new Set([l.profileId]),
      });
    }
  }
  return [...mapa.values()]
    .map(({ perfis, ...resto }) => ({ ...resto, atendentes: perfis.size }))
    .sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
}

/**
 * Agregado de retencao dos ultimos `dias` dias, com o nome do atendente.
 *
 * O erro das duas consultas SOBE: a tela precisa dizer que nao conseguiu ler.
 * Lista vazia so significa "nao ha agregado na janela".
 */
export function useCopilotRetention(dias: JanelaDias | number = DIAS_PADRAO) {
  const queryClient = useQueryClient();
  const desde = useMemo(() => diaLimite(dias), [dias]);

  const consulta = useQuery({
    queryKey: [QUERY_KEY_RETENCAO, dias, desde],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABELA_RETENCAO)
        .select(COLUNAS)
        .gte('agg_date', desde)
        .order('agg_date', { ascending: false });
      if (error) throw error;

      const linhas = (data ?? []) as unknown as LinhaAgregado[];
      const nomes = new Map<string, string>();
      const ids = [...new Set(linhas.map((l) => l.profile_id))];
      if (ids.length > 0) {
        // `profile_id` referencia `auth.users(id)`; o nome legivel vive em
        // `profiles` e a ponte e `profiles.user_id` (nao `profiles.id`).
        const { data: perfis, error: erroPerfis } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', ids);
        if (erroPerfis) throw erroPerfis;
        for (const p of (perfis ?? []) as unknown as LinhaPerfil[]) {
          if (p.name) nomes.set(p.user_id, p.name);
        }
      }

      return linhas.map((l) => mapLinha(l, nomes));
    },
    staleTime: 60_000,
  });

  const recalculo = useMutation({
    mutationFn: async () => {
      // O tipo gerado ainda nao conhece esta RPC (ele e regenerado do banco).
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
      const { data, error } = await rpc('recalcular_retencao_copiloto', { p_dias: dias });
      if (error) throw error;
      return typeof data === 'number' ? data : Number(data ?? 0);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY_RETENCAO] });
    },
  });

  const linhas = consulta.data ?? [];

  return {
    linhas,
    resumo: resumirRetencao(linhas),
    porAtendente: agruparPorAtendente(linhas),
    porDia: agruparPorDia(linhas),
    desde,
    isLoading: consulta.isLoading,
    isFetching: consulta.isFetching,
    isError: consulta.isError,
    error: consulta.error,
    refetch: consulta.refetch,
    recalcular: recalculo,
  };
}
