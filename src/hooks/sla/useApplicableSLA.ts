import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Prazo aplicável de 1ª resposta de um contato (PB-39).
 *
 * O resolvedor vive no BANCO (`resolve_applicable_sla`, SECURITY DEFINER): ele
 * conhece a mesma hierarquia que o Edge usa para cobrar o prazo e enxerga as
 * regras mesmo para o papel `agent`, que a RLS de `sla_rules` bloqueia. Antes
 * o hook montava a hierarquia no cliente e lia `sla_rules` + `sla_configurations`
 * POR CONVERSA (2 consultas por linha da lista virtualizada, ambas vazias para
 * o agente) — daí o prazo errado e o N+1.
 *
 * Agora: UMA chamada RPC por contato visível, com chave estável e cacheada
 * (mesmo contato na lista e no cabeçalho do chat compartilha a MESMA leitura).
 */
export type SLAMatchedLevel =
  | 'contact'
  | 'company'
  | 'job_title'
  | 'contact_type'
  | 'queue'
  | 'agent'
  | 'global_default'
  | 'system_default';

export interface ContactSLAParams {
  contactId?: string;
  company?: string | null;
  jobTitle?: string | null;
  contactType?: string | null;
  queueId?: string | null;
  agentId?: string | null;
}

export interface ApplicableSLA {
  firstResponseMinutes: number;
  resolutionMinutes: number;
  ruleName: string;
  ruleId: string | null;
  matchedLevel: SLAMatchedLevel;
}

const SYSTEM_DEFAULT_FIRST_RESPONSE_MINUTES = 5;
const SYSTEM_DEFAULT_RESOLUTION_MINUTES = 60;
const SYSTEM_DEFAULT_RULE_NAME = 'Padrão do Sistema';

/** TTL da leitura: o prazo configurado muda em minutos, não a cada render. */
export const APPLICABLE_SLA_STALE_TIME_MS = 60_000;

/** Chave compartilhada das regras ativas (id -> prazo de resolução). */
export const ACTIVE_SLA_RULES_QUERY_KEY = ['sla-rules-active'] as const;
/** Chave compartilhada da configuração padrão ativa. */
export const SLA_DEFAULT_CONFIG_QUERY_KEY = ['sla-configurations-default'] as const;

const MATCHED_LEVELS: readonly SLAMatchedLevel[] = [
  'contact',
  'company',
  'job_title',
  'contact_type',
  'queue',
  'agent',
  'global_default',
  'system_default',
];

function toMatchedLevel(value: string | null | undefined): SLAMatchedLevel {
  return MATCHED_LEVELS.includes(value as SLAMatchedLevel)
    ? (value as SLAMatchedLevel)
    : 'system_default';
}

/**
 * Regras ativas — leitura COMPARTILHADA (uma por sessão, nunca uma por conver-
 * sa). Serve apenas ao prazo de resolução da linha do tempo: o SLA de Resolução
 * está fora do resolvedor do banco (DEC-1), então o valor por regra continua
 * vindo daqui. Se a RLS esconder as regras (agente), a config default cobre.
 */
export function useActiveSLARules() {
  return useQuery({
    queryKey: ACTIVE_SLA_RULES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_rules')
        .select('id, resolution_minutes')
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; resolution_minutes: number }>;
    },
    staleTime: APPLICABLE_SLA_STALE_TIME_MS,
  });
}

/** Configuração padrão ativa — leitura compartilhada (só o prazo de resolução). */
export function useSLADefaultConfig() {
  return useQuery({
    queryKey: SLA_DEFAULT_CONFIG_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_configurations')
        .select('name, resolution_minutes')
        .eq('is_active', true)
        .eq('is_default', true)
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as { name: string; resolution_minutes: number } | null;
    },
    staleTime: APPLICABLE_SLA_STALE_TIME_MS,
  });
}

/** Campos que a RPC devolve (o prazo de resolução não faz parte do contrato dela). */
interface ApplicableSLAResolution {
  firstResponseMinutes: number;
  ruleName: string;
  ruleId: string | null;
  matchedLevel: SLAMatchedLevel;
}

export function useApplicableSLA(params: ContactSLAParams) {
  const contactId = params.contactId ?? null;
  const { data: activeRules = [] } = useActiveSLARules();
  const { data: defaultConfig = null } = useSLADefaultConfig();

  const query = useQuery<ApplicableSLAResolution>({
    queryKey: ['applicable-sla', params],
    // A RPC exige o contato; sem ele não há prazo a resolver (o antigo caminho
    // só por empresa/cargo/fila não tinha leitura confiável para o agente).
    enabled: !!contactId,
    staleTime: APPLICABLE_SLA_STALE_TIME_MS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('resolve_applicable_sla', {
        p_contact_id: contactId as string,
      });
      if (error) throw error;
      const row = (data ?? [])[0];
      if (!row) {
        return {
          firstResponseMinutes: SYSTEM_DEFAULT_FIRST_RESPONSE_MINUTES,
          ruleName: SYSTEM_DEFAULT_RULE_NAME,
          ruleId: null,
          matchedLevel: 'system_default' as SLAMatchedLevel,
        };
      }
      return {
        firstResponseMinutes: row.first_response_minutes,
        ruleName: row.rule_name,
        ruleId: row.rule_id || null,
        matchedLevel: toMatchedLevel(row.matched_level),
      };
    },
  });

  // A resolução é do MESMO nível que a RPC casou (rule_id), sem remontar a
  // hierarquia no cliente: é só um id -> valor.
  const resolutionMinutes = useMemo(() => {
    const matchedRule = query.data?.ruleId
      ? activeRules.find((rule) => rule.id === query.data?.ruleId)
      : undefined;
    return (
      matchedRule?.resolution_minutes ??
      defaultConfig?.resolution_minutes ??
      SYSTEM_DEFAULT_RESOLUTION_MINUTES
    );
  }, [query.data?.ruleId, activeRules, defaultConfig]);

  const data = useMemo<ApplicableSLA | undefined>(
    () => (query.data ? { ...query.data, resolutionMinutes } : undefined),
    [query.data, resolutionMinutes],
  );

  return { ...query, data };
}
