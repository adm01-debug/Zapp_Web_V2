import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export interface SLARuleMetadata {
  notify_on_warning?: boolean;
  escalation_notes?: string;
}

export interface SLARule {
  id: string;
  name: string;
  first_response_minutes: number;
  resolution_minutes: number;
  priority: number;
  contact_id: string | null;
  company: string | null;
  job_title: string | null;
  contact_type: string | null;
  queue_id: string | null;
  agent_id: string | null;
  is_active: boolean;
  metadata: SLARuleMetadata;
  created_at: string;
  updated_at: string;
}

export type SLARuleScope = 'contact' | 'company' | 'job_title' | 'contact_type' | 'queue' | 'agent';

export interface SLARuleForm {
  name: string;
  first_response_minutes: number;
  resolution_minutes: number;
  priority: number;
  contact_id?: string | null;
  company?: string | null;
  job_title?: string | null;
  contact_type?: string | null;
  queue_id?: string | null;
  agent_id?: string | null;
  metadata?: SLARuleMetadata;
}

export function useSLARules(scope?: SLARuleScope) {
  const queryClient = useQueryClient();
  const queryKey = ['sla-rules', scope];

  const { data: rules = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase.from('sla_rules').select('*').order('priority', { ascending: false });

      if (scope === 'contact') query = query.not('contact_id', 'is', null);
      else if (scope === 'company') query = query.not('company', 'is', null).is('contact_id', null);
      else if (scope === 'job_title') query = query.not('job_title', 'is', null).is('contact_id', null).is('company', null);
      else if (scope === 'contact_type') query = query.not('contact_type', 'is', null).is('contact_id', null).is('company', null).is('job_title', null);
      else if (scope === 'queue') query = query.not('queue_id', 'is', null).is('contact_id', null);
      else if (scope === 'agent') query = query.not('agent_id', 'is', null).is('contact_id', null);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SLARule[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (form: SLARuleForm) => {
      // Build base payload with typed fields; metadata uses Json cast for forward-compat
      const base = {
        name: form.name,
        first_response_minutes: form.first_response_minutes,
        resolution_minutes: form.resolution_minutes,
        priority: form.priority,
        contact_id: form.contact_id || null,
        company: form.company || null,
        job_title: form.job_title || null,
        contact_type: form.contact_type || null,
        queue_id: form.queue_id || null,
        agent_id: form.agent_id || null,
      };
      const payload = form.metadata
        ? { ...base, metadata: form.metadata as unknown as Json }
        : base;
      const { error } = await supabase.from('sla_rules').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-rules'] });
      queryClient.invalidateQueries({ queryKey: ['sla-rules-counts'] });
      toast.success('Regra de SLA criada');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...form }: SLARuleForm & { id: string }) => {
      const base = {
        name: form.name,
        first_response_minutes: form.first_response_minutes,
        resolution_minutes: form.resolution_minutes,
        priority: form.priority,
        contact_id: form.contact_id || null,
        company: form.company || null,
        job_title: form.job_title || null,
        contact_type: form.contact_type || null,
        queue_id: form.queue_id || null,
        agent_id: form.agent_id || null,
      };
      const payload = form.metadata
        ? { ...base, metadata: form.metadata as unknown as Json }
        : base;
      const { error } = await supabase.from('sla_rules').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-rules'] });
      queryClient.invalidateQueries({ queryKey: ['sla-rules-counts'] });
      toast.success('Regra de SLA atualizada');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sla_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<SLARule[]>(queryKey);
      queryClient.setQueryData<SLARule[]>(queryKey, old => (old || []).filter(r => r.id !== id));
      return { previous };
    },
    onError: (err: Error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-rules'] });
      queryClient.invalidateQueries({ queryKey: ['sla-rules-counts'] });
      toast.success('Regra de SLA removida');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('sla_rules').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<SLARule[]>(queryKey);
      queryClient.setQueryData<SLARule[]>(queryKey, old =>
        (old || []).map(r => r.id === id ? { ...r, is_active } : r)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['sla-rules'] }),
  });

  return {
    rules,
    isLoading,
    createRule: createMutation.mutate,
    updateRule: updateMutation.mutate,
    deleteRule: deleteMutation.mutate,
    toggleRule: toggleMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
