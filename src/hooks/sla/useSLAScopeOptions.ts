import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import type { SLARuleScope } from './useSLARules';

export interface SLAQueueOption {
  id: string;
  name: string;
}

export interface SLAAgentOption {
  id: string;
  name: string;
}

export interface SLAContactOption {
  id: string;
  name: string;
  phone: string;
}

export interface SLAScopeOptions {
  companies: string[];
  jobTitles: string[];
  queues: SLAQueueOption[];
  agents: SLAAgentOption[];
  contacts: SLAContactOption[];
}

/** TTL dos catálogos de escopo: mudam pouco e o diálogo reabre muitas vezes. */
const SLA_SCOPE_OPTIONS_STALE_TIME_MS = 60_000;

const MIN_CONTACT_SEARCH_LENGTH = 2;
const CONTACT_SEARCH_LIMIT = 20;

/**
 * Opções dos escopos do formulário de regra de SLA. Antes o diálogo montava
 * cinco consultas inline (`SLARuleFormDialog`), sem `staleTime` — cada abertura
 * refazia tudo; aqui ficam compartilhadas e cacheadas, com o mesmo gate de
 * escopo/abertura de antes.
 */
export function useSLAScopeOptions(
  open: boolean,
  scope: SLARuleScope,
  contactSearch: string,
): SLAScopeOptions {
  const { data: companies = [] } = useQuery({
    queryKey: ['sla-scope-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('company')
        .not('company', 'is', null);
      if (error) throw error;
      return [...new Set((data || []).map((d) => d.company).filter(Boolean))] as string[];
    },
    enabled: open && scope === 'company',
    staleTime: SLA_SCOPE_OPTIONS_STALE_TIME_MS,
  });

  const { data: jobTitles = [] } = useQuery({
    queryKey: ['sla-scope-jobtitles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('job_title')
        .not('job_title', 'is', null);
      if (error) throw error;
      return [...new Set((data || []).map((d) => d.job_title).filter(Boolean))] as string[];
    },
    enabled: open && scope === 'job_title',
    staleTime: SLA_SCOPE_OPTIONS_STALE_TIME_MS,
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['sla-scope-queues'],
    queryFn: async () => {
      const { data, error } = await supabase.from('queues').select('id, name');
      if (error) throw error;
      return (data || []) as SLAQueueOption[];
    },
    enabled: open && scope === 'queue',
    staleTime: SLA_SCOPE_OPTIONS_STALE_TIME_MS,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['sla-scope-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('is_active', true);
      if (error) throw error;
      return (data || []) as SLAAgentOption[];
    },
    enabled: open && scope === 'agent',
    staleTime: SLA_SCOPE_OPTIONS_STALE_TIME_MS,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['sla-scope-contacts', contactSearch],
    queryFn: async () => {
      const term = escapeOrFilterValue(`%${contactSearch}%`);
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .or(`name.ilike.${term},phone.ilike.${term}`)
        .limit(CONTACT_SEARCH_LIMIT);
      if (error) throw error;
      return (data || []) as SLAContactOption[];
    },
    enabled: open && scope === 'contact' && contactSearch.length >= MIN_CONTACT_SEARCH_LENGTH,
    staleTime: SLA_SCOPE_OPTIONS_STALE_TIME_MS,
  });

  return { companies, jobTitles, queues, agents, contacts };
}
