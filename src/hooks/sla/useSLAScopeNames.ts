import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SLARuleScope } from './useSLARules';
import { normalizeScopeIds } from './isValidUUID';

const NAMES_STALE_TIME = 10000;

/**
 * Resolve os nomes legíveis dos ids de escopo (`contact`, `queue`, `agent`)
 * das regras de SLA. Cada consulta só roda no escopo ativo e só com ids que
 * passam por `isValidUUID`: um id malformado em `.in()` responde 400 no
 * PostgREST (22P02) e o nome ficaria em branco sem aviso.
 *
 * As chaves usam a lista de ids normalizada (válidos, sem repetição, ordenada)
 * para não fragmentar o cache a cada render da lista.
 */
export function useSLAScopeNames(
  scope: SLARuleScope,
  contactIds: readonly string[],
  queueIds: readonly string[],
  agentIds: readonly string[]
) {
  const validContactIds = normalizeScopeIds(contactIds);
  const validQueueIds = normalizeScopeIds(queueIds);
  const validAgentIds = normalizeScopeIds(agentIds);

  const { data: contactNames = {} } = useQuery({
    queryKey: ['sla-contact-names', validContactIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .in('id', validContactIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach(c => {
        if (c.id) map[c.id] = `${c.name} (${c.phone})`;
      });
      return map;
    },
    enabled: scope === 'contact' && validContactIds.length > 0,
    staleTime: NAMES_STALE_TIME,
  });

  const { data: queueNames = {} } = useQuery({
    queryKey: ['sla-queue-names', validQueueIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queues')
        .select('id, name')
        .in('id', validQueueIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach(q => {
        map[q.id] = q.name;
      });
      return map;
    },
    enabled: scope === 'queue' && validQueueIds.length > 0,
    staleTime: NAMES_STALE_TIME,
  });

  const { data: agentNames = {} } = useQuery({
    queryKey: ['sla-agent-names', validAgentIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', validAgentIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach(a => {
        map[a.id] = a.name;
      });
      return map;
    },
    enabled: scope === 'agent' && validAgentIds.length > 0,
    staleTime: NAMES_STALE_TIME,
  });

  return { contactNames, queueNames, agentNames };
}
