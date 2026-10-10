import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ContactSLAParams {
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
}

const SYSTEM_DEFAULT: ApplicableSLA = {
  firstResponseMinutes: 5,
  resolutionMinutes: 60,
  ruleName: 'Padrão do Sistema',
  ruleId: null,
};

/**
 * Resolves the applicable SLA for a contact using a strict hierarchy.
 * Single-pass: iterates rules once, tracking the best match per level.
 * Hierarchy: contact > company > job_title > contact_type > queue > agent
 */
function resolveHierarchy(
  rules: Array<{
    id: string;
    name: string;
    first_response_minutes: number;
    resolution_minutes: number;
    contact_id: string | null;
    company: string | null;
    job_title: string | null;
    contact_type: string | null;
    queue_id: string | null;
    agent_id: string | null;
  }>,
  params: ContactSLAParams
): ApplicableSLA | null {
  let contactMatch: ApplicableSLA | null = null;
  let companyMatch: ApplicableSLA | null = null;
  let jobTitleMatch: ApplicableSLA | null = null;
  let contactTypeMatch: ApplicableSLA | null = null;
  let queueMatch: ApplicableSLA | null = null;
  let agentMatch: ApplicableSLA | null = null;

  for (const rule of rules) {
    const sla: ApplicableSLA = {
      firstResponseMinutes: rule.first_response_minutes,
      resolutionMinutes: rule.resolution_minutes,
      ruleName: rule.name,
      ruleId: rule.id,
    };

    // Contact-level (highest priority)
    if (rule.contact_id && rule.contact_id === params.contactId && !contactMatch) {
      contactMatch = sla;
      break; // Highest priority found — no need to continue
    }

    // Company-level (must not have contact_id)
    if (!rule.contact_id && rule.company && rule.company === params.company && !companyMatch) {
      companyMatch = sla;
    }

    // Job title (must not have contact_id or company)
    if (!rule.contact_id && !rule.company && rule.job_title && rule.job_title === params.jobTitle && !jobTitleMatch) {
      jobTitleMatch = sla;
    }

    // Contact type (must not have contact_id, company, or job_title)
    if (!rule.contact_id && !rule.company && !rule.job_title && rule.contact_type && rule.contact_type === params.contactType && !contactTypeMatch) {
      contactTypeMatch = sla;
    }

    // Queue (must not have contact_id)
    if (!rule.contact_id && rule.queue_id && rule.queue_id === params.queueId && !queueMatch) {
      queueMatch = sla;
    }

    // Agent (must not have contact_id)
    if (!rule.contact_id && rule.agent_id && rule.agent_id === params.agentId && !agentMatch) {
      agentMatch = sla;
    }
  }

  return contactMatch ?? companyMatch ?? jobTitleMatch ?? contactTypeMatch ?? queueMatch ?? agentMatch ?? null;
}

export function useApplicableSLA(params: ContactSLAParams) {
  return useQuery({
    queryKey: ['applicable-sla', params],
    queryFn: async (): Promise<ApplicableSLA> => {
      const { data: rules, error } = await supabase
        .from('sla_rules')
        .select('id, name, first_response_minutes, resolution_minutes, contact_id, company, job_title, contact_type, queue_id, agent_id')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) throw error;

      const match = resolveHierarchy(rules || [], params);
      if (match) return match;

      // Global fallback from sla_configurations
      const { data: configs } = await supabase
        .from('sla_configurations')
        .select('name, first_response_minutes, resolution_minutes')
        .eq('is_active', true)
        .eq('is_default', true)
        .limit(1);

      if (configs && configs.length > 0) {
        return {
          firstResponseMinutes: configs[0].first_response_minutes,
          resolutionMinutes: configs[0].resolution_minutes,
          ruleName: configs[0].name,
          ruleId: null,
        };
      }

      return SYSTEM_DEFAULT;
    },
    enabled: !!params.contactId || !!params.company || !!params.queueId || !!params.agentId,
    staleTime: 30000,
  });
}
