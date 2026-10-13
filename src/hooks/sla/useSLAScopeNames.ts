import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SLARuleScope } from './useSLARules';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Um escopo por UUID só pode virar filtro `.in('id', ...)` se for UUID de
 * verdade: id corrompido no banco faz o PostgREST recusar a consulta inteira
 * (`invalid input syntax for type uuid`) e a lista de regras fica vazia.
 */
export function isValidUUID(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/** TTL dos nomes: cadastro quase estático (mesmo padrão das contagens). */
const SLA_SCOPE_NAMES_STALE_TIME_MS = 60_000;

export interface SLAScopeNames {
  contactNames: Record<string, string>;
  queueNames: Record<string, string>;
  agentNames: Record<string, string>;
}

/**
 * Nome legível dos escopos por UUID (contato/fila/agente). Leitura compartilhada
 * por lista de ids e cacheada — antes cada `ScopeRulesList` montava as três
 * consultas inline, sem validação de UUID e sem `staleTime`.
 */
export function useSLAScopeNames(
  scope: SLARuleScope,
  contactIds: string[],
  queueIds: string[],
  agentIds: string[],
): SLAScopeNames {
  const { data: contactNames = {} } = useQuery({
    queryKey: ['sla-contact-names', contactIds],
    queryFn: async () => {
      const validIds = contactIds.filter(isValidUUID);
      if (validIds.length === 0) return {};
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .in('id', validIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((c) => {
        if (!c.id) return;
        map[c.id] = `${c.name} (${c.phone})`;
      });
      return map;
    },
    enabled: scope === 'contact' && contactIds.length > 0,
    staleTime: SLA_SCOPE_NAMES_STALE_TIME_MS,
  });

  const { data: queueNames = {} } = useQuery({
    queryKey: ['sla-queue-names', queueIds],
    queryFn: async () => {
      const validIds = queueIds.filter(isValidUUID);
      if (validIds.length === 0) return {};
      const { data, error } = await supabase.from('queues').select('id, name').in('id', validIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((q) => {
        map[q.id] = q.name;
      });
      return map;
    },
    enabled: scope === 'queue' && queueIds.length > 0,
    staleTime: SLA_SCOPE_NAMES_STALE_TIME_MS,
  });

  const { data: agentNames = {} } = useQuery({
    queryKey: ['sla-agent-names', agentIds],
    queryFn: async () => {
      const validIds = agentIds.filter(isValidUUID);
      if (validIds.length === 0) return {};
      const { data, error } = await supabase.from('profiles').select('id, name').in('id', validIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((a) => {
        map[a.id] = a.name;
      });
      return map;
    },
    enabled: scope === 'agent' && agentIds.length > 0,
    staleTime: SLA_SCOPE_NAMES_STALE_TIME_MS,
  });

  return { contactNames, queueNames, agentNames };
}
